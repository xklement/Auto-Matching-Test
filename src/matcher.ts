import { db } from "./db";

type TransactionRow = {
  id: string;
  amount: number;
  label: string;
  date: Date;
};

type InvoiceRow = {
  id: string;
  supplier_name: string;
  invoice_number: string;
  tax_free_total: number;
  vat_amount: number;
  due_date: string | null;
};

export type MatchSummary = {
  matched: number;
  leftOpen: number;
  errors: number;
};

// Float to interger to get exact comparison with cents
export function toCents(value: string | number): number {
  const text = typeof value === "number" ? value.toFixed(2) : String(value).trim();
  const negative = text.startsWith("-");
  const [eurosPart, centsPart = "0"] = (negative ? text.slice(1) : text).split(".");
  const euros = Number(eurosPart);
  const cents = Number(centsPart.padEnd(2, "0").slice(0, 2));
  if (!Number.isFinite(euros) || !Number.isFinite(cents)) {
    throw new Error(`Invalid money value: ${value}`);
  }
  const total = euros * 100 + cents;
  return negative ? -total : total;
}

function toUtcDay(value: Date | string): number {
  if (value instanceof Date) {
    return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()) / 86400000;
  }
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
}

export function dayDiff(a: Date | string, b: Date | string): number {
  return toUtcDay(a) - toUtcDay(b);
}

export function findMatch(
  transaction: TransactionRow,
  invoices: InvoiceRow[],
): InvoiceRow | null {
  const candidates = invoices
    .filter((invoice) => invoice.due_date != null)
    .filter(
      (invoice) =>
        toCents(invoice.tax_free_total) + toCents(invoice.vat_amount) ===
        Math.abs(toCents(transaction.amount)),
    )
    .filter((invoice) => {
      const diff = dayDiff(transaction.date, invoice.due_date!);
      return diff >= -30 && diff <= 3;
    });

  if (candidates.length !== 1) {
    return null;
  }
  return candidates[0];
}

async function getCandidates(companyId: string): Promise<InvoiceRow[]> {
  // get invoices by company
  // not matched yet and not deleted
  const { rows } = await db.query(
    `select * from buying_invoice
     where company_id = $1
       and deleted_at is null
       and not exists (
         select 1 from transaction t where t.matched_invoice_id = buying_invoice.id
       )`,
    [companyId],
  );
  return rows;
}

export async function listCompanies(): Promise<{ siren: string }[]> {
  const { rows } = await db.query<{ siren: string }>(
    `select siren from company order by siren`,
  );
  return rows;
}

export async function runAutoMatching(
  companySiren: string,
): Promise<MatchSummary> {
  const {
    rows: [company],
  } = await db.query(`select * from company where siren = $1`, [companySiren]);
  if (!company) {
    throw new Error(`Company not found for SIREN ${companySiren}`);
  }

  // get transactions by company
  // outgoing transactions only
  // not matched yet and not deleted
  const { rows: transactions } = await db.query<TransactionRow>(
    `select transaction.*
     from transaction
     join account on account.id = transaction.account_id
     where account.company_id = $1
       and transaction.matched_invoice_id is null
       and transaction.deleted_at is null
       and transaction.amount < 0`,
    [company.id],
  );

  const invoices = await getCandidates(company.id);
  const available = new Map(invoices.map((invoice) => [invoice.id, invoice]));

  let matched = 0;
  let leftOpen = 0;
  let errors = 0;

  for (const transaction of transactions) {
    const invoice = findMatch(transaction, [...available.values()]);
    if (!invoice) {
      leftOpen++;
      continue;
    }

    try {
      const result = await db.query(
        `update transaction
         set matched_invoice_id = $1
         where id = $2 and matched_invoice_id is null`,
        [invoice.id, transaction.id],
      );
      if (result.rowCount !== 1) {
        leftOpen++;
        continue;
      }
      available.delete(invoice.id);
      matched++;
    } catch (e) {
      errors++;
      console.error(`match failed for transaction ${transaction.id}`, e);
    }
  }

  console.log(
    `${company.name} (${company.siren}): matched=${matched} left_open=${leftOpen} errors=${errors}`,
  );
  return { matched, leftOpen, errors };
}
