import React from 'react';
import { ICON_PATHS } from '../constants';

interface LegendIconProps {
  icon: string;
  color?: string;
  size?: number | string;
  className?: string;
}

export const LegendIcon: React.FC<LegendIconProps> = ({
  icon,
  color = 'currentColor',
  size = 18,
  className = '',
}) => {
  const iconData = ICON_PATHS[icon] || ICON_PATHS['help'];
  const normScale = 24 / 512;

  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={`inline-block flex-shrink-0 ${className}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {Array.isArray(iconData) ? (
        <g transform={`scale(${normScale})`}>
          {iconData.map((pathItem: any, idx: number) => (
            <path
              key={idx}
              d={pathItem.d}
              fill={pathItem.fill || color}
              transform={pathItem.transform || ''}
            />
          ))}
        </g>
      ) : (
        <path d={iconData || ICON_PATHS.help} fill={color} />
      )}
    </svg>
  );
};
