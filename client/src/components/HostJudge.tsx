interface Props {
  buzzedAnswerText: string | null;
  correctResponse: string | null;
  onJudge: (correct: boolean) => void;
}

export default function HostJudge({
  buzzedAnswerText,
  correctResponse,
  onJudge,
}: Props) {
  return (
    <div className="judge">
      <div className="judge-row">
        <strong>They said:</strong>
        <span className="said">{buzzedAnswerText || <em>(no text)</em>}</span>
      </div>
      <div className="judge-row">
        <strong>Correct:</strong>
        <span className="correct">{correctResponse}</span>
      </div>
      <div className="judge-buttons">
        <button className="judge-correct" onClick={() => onJudge(true)}>
          ✓ Correct
        </button>
        <button className="judge-wrong" onClick={() => onJudge(false)}>
          ✗ Incorrect
        </button>
      </div>
    </div>
  );
}
