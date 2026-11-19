-- CP-77 (#893, Money MM-1, D-078): the co-founders hold one more role, `founder`, besides the one they have. A role is a row; a grant of it is
-- additive (staff_role_grant), so a co-founder who is also a coordinator keeps every coordinator power. Who may change the money rules is the
-- setting `money.rule_setters` (this role). Data only: no table, column or function.
insert into role (tenant_id, code, label, scope, may_grant, one_per_class, ord, access_group)
select id, 'founder', 'Co-founder', 'campus', array['head', 'coordinator'], false, 13, 'everything' from tenant
on conflict (tenant_id, code) do nothing;
