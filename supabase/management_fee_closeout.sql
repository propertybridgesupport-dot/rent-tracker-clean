create table if not exists public.management_fee_invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  invoice_month text not null,
  invoice_number text not null unique,
  cutoff_date date not null,
  fee_rate numeric not null default 0.10,
  collected_amount numeric not null default 0,
  fee_amount numeric not null default 0,
  status text not null default 'closed',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.management_fee_invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.management_fee_invoices(id) on delete cascade,
  payment_id uuid not null references public.payments(id) on delete restrict,
  property_id uuid references public.properties(id) on delete set null,
  payment_month text not null,
  payment_date date not null,
  collected_amount numeric not null default 0,
  fee_amount numeric not null default 0,
  created_at timestamptz not null default now(),
  constraint management_fee_invoice_items_payment_unique unique (payment_id)
);

create index if not exists management_fee_invoices_company_month_idx
  on public.management_fee_invoices(company_id, invoice_month, cutoff_date);

create index if not exists management_fee_invoice_items_invoice_idx
  on public.management_fee_invoice_items(invoice_id);

alter table public.management_fee_invoices enable row level security;
alter table public.management_fee_invoice_items enable row level security;

drop policy if exists "Users can view own management fee invoices" on public.management_fee_invoices;
create policy "Users can view own management fee invoices"
on public.management_fee_invoices for select
using (
  exists (
    select 1 from public.companies c
    where c.id = management_fee_invoices.company_id
      and c.company_id = auth.uid()
  )
);

drop policy if exists "Users can insert own management fee invoices" on public.management_fee_invoices;
create policy "Users can insert own management fee invoices"
on public.management_fee_invoices for insert
with check (
  exists (
    select 1 from public.companies c
    where c.id = management_fee_invoices.company_id
      and c.company_id = auth.uid()
  )
);

drop policy if exists "Users can update own management fee invoices" on public.management_fee_invoices;
create policy "Users can update own management fee invoices"
on public.management_fee_invoices for update
using (
  exists (
    select 1 from public.companies c
    where c.id = management_fee_invoices.company_id
      and c.company_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.companies c
    where c.id = management_fee_invoices.company_id
      and c.company_id = auth.uid()
  )
);

drop policy if exists "Users can delete own management fee invoices" on public.management_fee_invoices;
create policy "Users can delete own management fee invoices"
on public.management_fee_invoices for delete
using (
  exists (
    select 1 from public.companies c
    where c.id = management_fee_invoices.company_id
      and c.company_id = auth.uid()
  )
);

drop policy if exists "Users can view own management fee invoice items" on public.management_fee_invoice_items;
create policy "Users can view own management fee invoice items"
on public.management_fee_invoice_items for select
using (
  exists (
    select 1
    from public.management_fee_invoices i
    join public.companies c on c.id = i.company_id
    where i.id = management_fee_invoice_items.invoice_id
      and c.company_id = auth.uid()
  )
);

drop policy if exists "Users can insert own management fee invoice items" on public.management_fee_invoice_items;
create policy "Users can insert own management fee invoice items"
on public.management_fee_invoice_items for insert
with check (
  exists (
    select 1
    from public.management_fee_invoices i
    join public.companies c on c.id = i.company_id
    where i.id = management_fee_invoice_items.invoice_id
      and c.company_id = auth.uid()
  )
);

drop policy if exists "Users can delete own management fee invoice items" on public.management_fee_invoice_items;
create policy "Users can delete own management fee invoice items"
on public.management_fee_invoice_items for delete
using (
  exists (
    select 1
    from public.management_fee_invoices i
    join public.companies c on c.id = i.company_id
    where i.id = management_fee_invoice_items.invoice_id
      and c.company_id = auth.uid()
  )
);
