import { useLang } from './Lang';
import { PLAYER_COLORS } from './game';
import type { StringKey } from './i18n';

const COLOR_NAMES: StringKey[] = [
  'color.red',
  'color.blue',
  'color.green',
  'color.amber',
  'color.purple',
  'color.cyan',
  'color.pink',
  'color.lime',
];

export function ColorDots({
  value,
  used,
  onPick,
}: {
  value: number;
  used: number[];
  onPick: (color: number) => void;
}) {
  const { t } = useLang();
  return (
    <div className="color-dots">
      {PLAYER_COLORS.map((color, index) => (
        <button
          key={color}
          className="color-dot"
          type="button"
          style={{ background: color }}
          aria-label={t(COLOR_NAMES[index])}
          aria-pressed={index === value}
          disabled={index !== value && used.includes(index)}
          onClick={() => onPick(index)}
        />
      ))}
    </div>
  );
}
