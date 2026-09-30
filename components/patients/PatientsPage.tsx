import { Icon } from '@/components/shared/Icons';
import { Empty } from '@/components/shared/Empty';
import { date, canCare, type Snapshot } from '@/shared/types';
export function PatientsPage({
  data,
  open,
  admit,
}: {
  data: Snapshot;
  open: (id: string) => void;
  admit: () => void;
}) {
  return (
    <>
      <div className="section-heading">
        <div>
          <span className="eyebrow">رعاية منظمة، من أول لحظة</span>
          <h1>المرضى والإقامة</h1>
          <p>استقبل المرضى، تابع الخدمات، وانقلهم بسهولة بين الأقسام.</p>
        </div>
        {canCare(data.actor) && (
          <button className="button primary" onClick={admit}>
            <Icon name="plus" />
            تسجيل مريض
          </button>
        )}
      </div>
      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-icon mint">
            <Icon name="patients" />
          </span>
          <span>المرضى المقيمون</span>
          <strong>
            {data.stats.active}
            <small>مريض</small>
          </strong>
          <p>إقامات مفتوحة حاليًا</p>
        </div>
        <div className="stat-card">
          <span className="stat-icon blue">
            <Icon name="bed" />
          </span>
          <span>الأسرة المتاحة</span>
          <strong>
            {data.stats.freeBeds}
            <small>سرير</small>
          </strong>
          <p>جاهزة لاستقبال المرضى</p>
        </div>
        <div className="stat-card dark">
          <span className="stat-icon">
            <Icon name="heart" />
          </span>
          <span>مساحة للرعاية</span>
          <strong className="stat-text">
            تفاصيل أقل.
            <br />
            اهتمام أكبر.
          </strong>
          <p>ملف واحد يجمع رحلة المريض.</p>
        </div>
      </div>
      <section className="surface">
        <div className="surface-head">
          <div>
            <h2>قائمة المرضى</h2>
            <p>اضغط على المريض لفتح ملف الإقامة</p>
          </div>
          <span className="count-tag">{data.stays.length} في هذه الصفحة</span>
        </div>
        {!data.stays.length ? (
          <Empty
            title="لا توجد إقامات مطابقة"
            detail="ابدأ بتسجيل مريض واختيار السرير المناسب، أو غيّر البحث."
          />
        ) : (
          <div className="patient-list">
            {data.stays.map((s) => (
              <button className="patient-row" onClick={() => open(s.id)} key={s.id}>
                <span className="avatar">
                  {s.name
                    .split(' ')
                    .slice(0, 2)
                    .map((v) => v[0])
                    .join('')}
                </span>
                <span className="patient-name">
                  <strong>{s.name}</strong>
                  <small>
                    ملف {s.patientNumber} · إقامة {s.number}
                  </small>
                </span>
                <span className="patient-location">
                  <Icon name="bed" size={17} />
                  {s.location}
                </span>
                <span className="patient-date">{date(s.admittedAt)}</span>
                <span className={`badge ${s.status === 'open' ? 'green' : 'gray'}`}>
                  {s.status === 'open' ? 'مقيم' : 'غادر'}
                </span>
                <Icon name="left" size={18} />
              </button>
            ))}
          </div>
        )}
      </section>
      <section className="bed-section">
        <div className="surface-head">
          <div>
            <h2>نظرة على الأسرة</h2>
            <p>التوفر الحالي داخل المنشأة</p>
          </div>
          <span className="legend">
            <i />
            متاح <i className="occupied" />
            مشغول
          </span>
        </div>
        <div className="beds-grid">
          {data.beds.slice(0, 20).map((b) => (
            <div className={`bed-tile ${b.occupied ? 'occupied' : ''}`} key={b.id}>
              <Icon name="bed" />
              <strong>{b.name}</strong>
              <span>{b.ward}</span>
              <small>{b.department}</small>
            </div>
          ))}
          {!data.beds.length && (
            <p className="muted">أضف الأقسام والأجنحة والأسرة من إعدادات المنشأة.</p>
          )}
        </div>
      </section>
    </>
  );
}
