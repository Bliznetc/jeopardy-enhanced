import { useState } from 'react';

interface Props {
  onSubmit: (text: string) => void;
  placeholder?: string;
  buttonLabel?: string;
}

export default function AnswerInput({
  onSubmit,
  placeholder,
  buttonLabel,
}: Props) {
  const [text, setText] = useState('');
  return (
    <form
      className="answer-input"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) onSubmit(text.trim());
      }}
    >
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder ?? 'Your response…'}
        autoFocus
      />
      <button type="submit" disabled={!text.trim()}>
        {buttonLabel ?? 'Submit'}
      </button>
    </form>
  );
}
