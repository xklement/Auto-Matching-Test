-- Numeric values
alter table transaction
  alter column amount type numeric(12, 2)
  using amount::numeric(12, 2);

alter table buying_invoice
  alter column tax_free_total type numeric(12, 2)
  using tax_free_total::numeric(12, 2);

alter table buying_invoice
  alter column vat_amount type numeric(12, 2)
  using vat_amount::numeric(12, 2);

-- Due date: varchar -> date 
alter table buying_invoice
  alter column due_date type date
  using nullif(due_date, '')::date;

-- Foreign keys
alter table account
  add constraint account_company_id_fkey
  foreign key (company_id) references company (id);

alter table transaction
  add constraint transaction_account_id_fkey
  foreign key (account_id) references account (id);

alter table transaction
  add constraint transaction_matched_invoice_id_fkey
  foreign key (matched_invoice_id) references buying_invoice (id);

-- One invoice -> one transaction
create unique index transaction_matched_invoice_id_uidx
  on transaction (matched_invoice_id)
  where matched_invoice_id is not null;

