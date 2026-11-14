import type { SkyPatch } from '../data/types';
import { changeAmountText, changeWhereText, type ChangesResult, type FieldChange } from '../sky/changes';
import { useI18n } from '../i18n/react';

interface Props {
  patch: SkyPatch;
  result: ChangesResult;
  onPick: (c: FieldChange) => void;
}

export function ChangesList({ patch, result, onPick }: Props) {
  const { t } = useI18n();
  if (result.single) {
    return <p className="empty">{t('chg.single')}</p>;
  }
  const a = patch.epochs[result.first].label;
  const b = patch.epochs[result.last].label;
  return (
    <div className="changes-wrap">
      <p className="t-caption c-3">{t('chg.between', { a, b })}</p>
      {result.rows.length === 0 ? (
        <p className="empty">{t('chg.none')}</p>
      ) : (
        <ul className="changes">
          {result.rows.map((c, i) => (
            <li key={i}>
              <button type="button" onClick={() => onPick(c)}>
                <span className={`kind kind-${c.kind.toLowerCase()}`}>{t(`chg.kind.${c.kind}`)}</span>
                <span className="changes-text">
                  <strong>{changeAmountText(c.amount) || t('chg.newOrGone')}</strong>
                  <span>{changeWhereText(c.where)}</span>
                </span>
                <span className="changes-go">{t('chg.show')}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="t-caption c-3">{t('chg.note')}</p>
    </div>
  );
}

