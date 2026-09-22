/**
 * Волна-маркер под числом рейтинга.
 *
 * Это не индикатор, а украшение: будто число подчеркнули толстым маркером,
 * и мазок тянется во всю ширину карточки, лениво покачиваясь.
 *
 * Рисуем несколько одинаковых периодов и сдвигаем ровно на один — тогда
 * кадр в конце цикла совпадает с началом и шва не видно. Длина периода
 * уезжает в CSS-переменную, чтобы путь и анимация не могли разойтись:
 * именно из-за такого расхождения волна дёргалась назад раз в цикл.
 */
const PERIOD = 150;
const AMPLITUDE = 12;
const VIEW_WIDTH = 800;

function wavePath(width: number, amplitude: number, period: number, y: number): string {
  const half = period / 2;
  let path = `M0 ${y}`;
  for (let x = 0; x < width; x += period) {
    path += ` q ${half / 2} ${-amplitude} ${half} 0 q ${half / 2} ${amplitude} ${half} 0`;
  }
  return path;
}

export function RatingWave() {
  return (
    <span className="rating-wave" aria-hidden="true" style={{ '--wave-period': `${PERIOD}px` } as React.CSSProperties}>
      <svg viewBox={`0 0 ${VIEW_WIDTH} 60`} preserveAspectRatio="none">
        <g className="rating-wave-run">
          {/* Длина пути с запасом: он должен перекрывать экран и после сдвига. */}
          <path d={wavePath(VIEW_WIDTH * 2 + PERIOD, AMPLITUDE, PERIOD, 34)} />
        </g>
      </svg>
    </span>
  );
}
