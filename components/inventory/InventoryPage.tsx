import { Icon } from '@/components/shared/Icons';
import { Empty } from '@/components/shared/Empty';
import { currency, canStock, type Item, type Snapshot } from '@/shared/types';
export function InventoryPage({
  data,
  edit,
  stock,
  history,
}: {
  data: Snapshot;
  edit: (item?: Item) => void;
  stock: (item: Item) => void;
  history: (item: Item) => void;
}) {
  return (
    <>
      <div className="section-heading">
        <div>
          <span className="eyebrow">كل مادة، في وقتها</span>
          <h1>المخزون والمستلزمات</h1>
          <p>تابع الكميات والأسعار، وسجّل الوارد والمنصرف بوضوح.</p>
        </div>
        {canStock(data.actor) && (
          <button className="button primary" onClick={() => edit()}>
            <Icon name="plus" />
            إضافة مادة
          </button>
        )}
      </div>
      <div className="inventory-intro">
        <div className="inventory-illustration">
          <Icon name="inventory" size={62} />
        </div>
        <div>
          <span className="eyebrow">جاهزية المستودع</span>
          <h2>{data.stats.lowStock ? 'مواد تحتاج إلى إعادة تزويد' : 'مخزون واضح. عمل مستمر.'}</h2>
          <p>
            {data.stats.lowStock
              ? `${data.stats.lowStock} مواد عند الحد الأدنى أو أقل. راجع الكميات قبل نفادها.`
              : 'كل حركة مسجلة، وكل سعر واضح للفريق.'}
          </p>
        </div>
        <span className="big-number">
          {data.stats.lowStock}
          <small>تنبيه مخزون</small>
        </span>
      </div>
      <section className="surface">
        <div className="surface-head">
          <div>
            <h2>المواد المتوفرة</h2>
            <p>الأسعار بالليرة السورية</p>
          </div>
          <span className="count-tag">{data.total} مادة</span>
        </div>
        {!data.items.length ? (
          <Empty
            icon="inventory"
            title="مستودعك يبدأ من هنا"
            detail="أضف المادة وسعرها، ثم سجّل الكمية الواردة."
          />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>المادة</th>
                  <th>السعر</th>
                  <th>الكمية</th>
                  <th>الحالة</th>
                  <th>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <div className="item-identity">
                        <span className="item-icon">
                          <Icon name="inventory" />
                        </span>
                        <div>
                          <strong>{i.name}</strong>
                          <small dir="ltr">{i.sku}</small>
                        </div>
                      </div>
                    </td>
                    <td>{currency(i.price)}</td>
                    <td>
                      <strong className="quantity">{i.quantity}</strong>
                      <small> {i.unit}</small>
                    </td>
                    <td>
                      <span className={`badge ${i.quantity <= i.minimum ? 'amber' : 'green'}`}>
                        {i.quantity === 0
                          ? 'نفدت الكمية'
                          : i.quantity <= i.minimum
                            ? 'يحتاج تزويد'
                            : 'متوفر'}
                      </span>
                    </td>
                    <td>
                      <div className="row-actions">
                        {canStock(data.actor) && (
                          <>
                            <button className="button small" onClick={() => stock(i)}>
                              <Icon name="transfer" size={16} />
                              حركة
                            </button>
                            <button className="button small subtle" onClick={() => edit(i)}>
                              تعديل
                            </button>
                            <button
                              className="icon-button"
                              aria-label={'سجل ' + i.name}
                              onClick={() => history(i)}
                            >
                              <Icon name="clock" size={18} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
