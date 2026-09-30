import Link from 'next/link';
import { Icon } from '@/components/shared/Icons';
import { Empty } from '@/components/shared/Empty';
import { currency, date, categories, type Snapshot, type Expense } from '@/shared/types';
export function BillsPage({
  data,
  add,
  voidExpense,
}: {
  data: Snapshot;
  add: () => void;
  voidExpense: (e: Expense) => void;
}) {
  return (
    <>
      <div className="section-heading">
        <div>
          <span className="eyebrow">حسابات واضحة، قرارات أسهل</span>
          <h1>الفواتير والمصروفات</h1>
          <p>تحصيل المرضى ومصروفات المنشأة في مساحة واحدة.</p>
        </div>
        <button className="button primary" onClick={add}>
          <Icon name="plus" />
          تسجيل مصروف
        </button>
      </div>
      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-icon mint">
            <Icon name="wallet" />
          </span>
          <span>المبالغ المحصلة</span>
          <strong className="money-stat">{currency(data.stats.received)}</strong>
          <p>إجمالي الدفعات المسجلة</p>
        </div>
        <div className="stat-card">
          <span className="stat-icon amber">
            <Icon name="down" />
          </span>
          <span>مصروفات المنشأة</span>
          <strong className="money-stat">{currency(data.stats.spent)}</strong>
          <p>المصروفات الفعالة منذ بدء العمل</p>
        </div>
        <div className="stat-card dark">
          <span className="stat-icon">
            <Icon name="trend" />
          </span>
          <span>صافي الحركة النقدية المسجلة</span>
          <strong className="money-stat">
            {currency((BigInt(data.stats.received) - BigInt(data.stats.spent)).toString())}
          </strong>
          <p>مؤشر نقدي وليس صافي الربح المحاسبي</p>
        </div>
      </div>
      <section className="surface">
        <div className="surface-head">
          <div>
            <h2>المصروفات</h2>
            <p>سجل واضح لما تدفعه المنشأة</p>
          </div>
          <span className="count-tag">{data.total} سجل</span>
        </div>
        {!data.expenses.length ? (
          <Empty
            icon="bills"
            title="لا توجد مصروفات مسجلة"
            detail="أضف فاتورة شراء أو راتبًا أو مصروف تشغيل."
          />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>المصروف</th>
                  <th>التصنيف</th>
                  <th>التاريخ</th>
                  <th>المبلغ</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.expenses.map((e) => (
                  <tr key={e.id} className={e.voided ? 'voided' : ''}>
                    <td>
                      <strong>{e.title}</strong>
                      <small>{e.voided ? 'ملغى' : e.note}</small>
                    </td>
                    <td>
                      <span className="badge gray">{categories[e.category]}</span>
                    </td>
                    <td>{date(e.date)}</td>
                    <td>
                      <strong>{currency(e.amount)}</strong>
                    </td>
                    <td>
                      {data.actor.role === 'admin' && !e.voided && (
                        <button className="button small subtle" onClick={() => voidExpense(e)}>
                          إلغاء
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="surface spaced">
        <div className="surface-head">
          <div>
            <h2>التحصيل من المرضى</h2>
            <p>افتح ملف المريض من تبويب المرضى للوصول إلى أي إقامة.</p>
          </div>
        </div>
        {data.stays
          .filter((s) => s.status === 'open')
          .slice(0, 6)
          .map((s) => (
            <div className="payment-line" key={s.id}>
              <span>
                <Icon name="patients" />
                {s.name}
              </span>
              <strong>{currency(s.balance || '0')}</strong>
              <Link href={'/checkout/' + s.id} className="button small">
                تحصيل
                <Icon name="left" size={16} />
              </Link>
            </div>
          ))}
      </section>
    </>
  );
}
