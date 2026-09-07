import {sqliteTable,text,integer,real,uniqueIndex,check} from 'drizzle-orm/sqlite-core';
import {sql} from 'drizzle-orm';
export const workshops=sqliteTable('workshops',{
  id:text('id').primaryKey(),name:text('name').notNull(),published:integer('published').notNull().default(0),createdAt:text('created_at').notNull(),
});
export const students=sqliteTable('students',{
  id:text('id').primaryKey(),workshopId:text('workshop_id').notNull().references(()=>workshops.id),
  name:text('name').notNull(),email:text('email').notNull(),code:text('code').notNull(),revision:integer('revision').notNull().default(0),
  q1Score:real('q1_score'),q1Rating:integer('q1_rating'),q2Score:real('q2_score'),q2Rating:integer('q2_rating'),
  q3Score:real('q3_score'),q3Rating:integer('q3_rating'),q4Score:real('q4_score'),q4Rating:integer('q4_rating'),
  updatedAt:text('updated_at').notNull(),updatedBy:text('updated_by').notNull(),
},t=>[
  uniqueIndex('students_workshop_email').on(t.email,t.workshopId),uniqueIndex('students_workshop_code').on(t.workshopId,t.code),
  ...([1,2,3,4] as const).map(n=>check(`q${n}_valid`,sql.raw(`(q${n}_score IS NULL AND q${n}_rating IS NULL) OR (q${n}_score IS NOT NULL AND q${n}_rating IS NOT NULL AND q${n}_score BETWEEN 0 AND 100 AND q${n}_rating BETWEEN 1 AND 5)`))),
]);
