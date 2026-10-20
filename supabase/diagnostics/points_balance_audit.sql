-- Read-only diagnostic for campaign point balance consistency.
-- Run manually in the Supabase SQL editor after reviewing access permissions.
-- This intentionally does NOT update balances: older award paths or imported
-- balances may not have complete ledger history, so a mismatch needs inspection.
with ledger as (
  select
    pt.campaign_id,
    pt.user_id,
    coalesce(sum(pt.amount), 0)::bigint as ledger_net_points,
    count(pt.id)::bigint as transaction_count
  from public.point_transactions pt
  group by pt.campaign_id, pt.user_id
)
select
  cu.campaign_id,
  cu.user_id,
  coalesce(cu.points_balance, 0)::bigint as cached_points_balance,
  coalesce(l.ledger_net_points, 0)::bigint as ledger_net_points,
  (
    coalesce(cu.points_balance, 0) - coalesce(l.ledger_net_points, 0)
  )::bigint as balance_minus_ledger,
  coalesce(l.transaction_count, 0)::bigint as transaction_count,
  case
    when coalesce(cu.points_balance, 0) = coalesce(l.ledger_net_points, 0)
      then 'MATCH'
    when coalesce(l.transaction_count, 0) = 0 and coalesce(cu.points_balance, 0) <> 0
      then 'REVIEW: balance exists without ledger rows'
    else 'REVIEW: cached balance differs from ledger'
  end as audit_status
from public.campaign_users cu
left join ledger l
  on l.campaign_id = cu.campaign_id
 and l.user_id = cu.user_id
order by
  case when coalesce(cu.points_balance, 0) = coalesce(l.ledger_net_points, 0) then 1 else 0 end,
  abs(coalesce(cu.points_balance, 0) - coalesce(l.ledger_net_points, 0)) desc,
  cu.campaign_id,
  cu.user_id;
