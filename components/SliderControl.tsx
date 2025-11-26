import React from 'react';

interface SliderControlProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (val: number) => void;
  disabled?: boolean;
}

export const SliderControl: React.FC<SliderControlProps> = ({
  label,
  value,
  min,
  max,
  onChange,
  disabled
}) => {
  return (
    <div className="mb-6">
      <div className="flex justify-between items-center mb-2">
        <label className="text-sm font-medium text-gray-700">{label}:</label>
        <div className="flex items-center border border-gray-300 rounded px-2 py-0.5 bg-white">
          <input 
            type="number"
            value={value}
            min={min}
            max={max}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-10 text-right text-sm outline-none border-none p-0"
            disabled={disabled}
          />
          {/* Mock Arrows for visual fidelity to screenshot */}
          <div className="flex flex-col ml-1 border-l pl-1 border-gray-200">
             <button className="text-[8px] leading-[8px] hover:text-blue-600" onClick={() => value < max && onChange(value + 1)}>▲</button>
             <button className="text-[8px] leading-[8px] hover:text-blue-600" onClick={() => value > min && onChange(value - 1)}>▼</button>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className={`h-1.5 w-full bg-gray-200 rounded-lg overflow-hidden relative ${disabled ? 'opacity-50' : ''}`}>
           <input
            type="range"
            min={min}
            max={max}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-full h-full absolute top-0 left-0 opacity-0 cursor-pointer z-10"
            disabled={disabled}
           />
           {/* Custom track fill */}
           <div 
             className="h-full bg-blue-500 absolute top-0 left-0"
             style={{ width: `${((value - min) / (max - min)) * 100}%` }}
           />
           {/* Custom thumb (visual only, input handles interaction) */}
           <div 
             className="h-3 w-3 bg-white border border-gray-400 shadow rounded-full absolute top-1/2 -translate-y-1/2 -ml-1.5 pointer-events-none"
             style={{ left: `${((value - min) / (max - min)) * 100}%` }}
           />
        </div>
      </div>
    </div>
  );
};
