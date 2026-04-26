import { useState } from 'react';

interface Props {
  min: number;
  max: number;
  onSubmit: (amount: number) => void;
  label?: string;
}

export default function WagerInput({ min, max, onSubmit, label }: Props) {
  const [text, setText] = useState('');
  const value = Number(text);
  const valid = Number.isInteger(value) && value >= min && value <= max;

  return (
    <form
      className="wager-input"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSubmit(value);
      }}
    >
      <label>
        {label ?? `Wager ($${min} – $${max.toLocaleString()})`}
        <input
          type="number"
          inputMode="numeric"
          value={text}
          onChange={(e) => setText(e.target.value)}
          min={min}
          max={max}
          step={1}
          autoFocus
        />
      </label>
      <button type="submit" disabled={!valid}>
        Submit wager
      </button>
    </form>
  );
}
