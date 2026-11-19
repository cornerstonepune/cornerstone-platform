-- CP-76 (#891, Money MM-0, D-077): the school is two campuses. The one campus row, which was named after the school, becomes Gurukul
-- (same id, so every class, member of staff and school day on it stays put); Neev is added. Data only: no table, column or function.
-- Which campus runs which grade is the setting `school.campus_grades`; a person held for one campus is `staff.campus_id`.
update campus c set name = 'Gurukul' from tenant t where c.tenant_id = t.id and c.name = t.name;
insert into campus (tenant_id, name) select c.tenant_id, 'Neev' from campus c where c.name = 'Gurukul'
on conflict (tenant_id, name) do nothing;
