import '../styles/forecast-confirmation.css';

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none" aria-hidden="true" focusable="false">
      <path d="m4.5 10 3.5 3.5 7.5-7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ForecastProgress({ booked }: { booked: boolean }) {
  return (
    <ul className="forecast-progress" aria-label="Your forecast progress">
      <li className="forecast-progress__item">
        <span className="forecast-progress__icon"><CheckIcon /></span>
        <span>Submission received</span>
      </li>
      <li className="forecast-progress__item">
        <span className="forecast-progress__icon"><CheckIcon /></span>
        <span>Forecast built</span>
      </li>
      <li className={`forecast-progress__item ${booked ? 'forecast-progress__item--booked' : 'forecast-progress__item--pending'}`}>
        <span className="forecast-progress__icon">
          {booked ? <CheckIcon /> : <span className="forecast-progress__dot" aria-hidden="true" />}
        </span>
        <span>{booked ? 'Call booked' : 'Call not booked yet'}</span>
      </li>
    </ul>
  );
}

const questions = [
  ['Is the forecast a guarantee?', 'No. It is a model of the assumptions you entered, and its purpose is to make those assumptions arguable before spend.'],
  ['Who should attend?', 'Whoever can approve budget and whoever owns the current funnel numbers. Two people is usually right.'],
  ['What if my data is incomplete?', 'That is itself a finding, and often the first constraint. Bring what you have.'],
  ['Is this a fit if we have never run a webinar?', 'Sometimes. The requirement is a validated offer with real customers, not prior webinar history.'],
  ['What happens after the review?', 'Recommendations and next steps depend on what the forecast review surfaces. Nothing is committed on the call.'],
];

export function ForecastFaq() {
  return (
    <div className="forecast-faq">
      {questions.map(([question, answer]) => (
        <details className="forecast-faq__item" key={question}>
          <summary>
            <span>{question}</span>
            <svg className="forecast-faq__chevron" viewBox="0 0 20 20" width="20" height="20" fill="none" aria-hidden="true" focusable="false">
              <path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </summary>
          <div className="forecast-faq__answer">{answer}</div>
        </details>
      ))}
    </div>
  );
}
