import Button from "../../Control/Button";
import Countdown, { zeroPad } from "react-countdown";

export default function DaleOfWeekThree({ last }) {
  return (
    <div className="dow-three">
      <div className="container">
        <div className="dow-three__content">
          <h5>Deal of the week</h5>
          <h3>-30% of on creams</h3>
          <Countdown
            date={Date.now() + last}
            renderer={({ days, hours, minutes, seconds }) => {
              return (
                <div className="dow-three__content__countdown">
                  <div className="countdown__item">
                    <h6>{zeroPad(days)}</h6> <span>days</span>
                  </div>
                  :
                  <div className="countdown__item">
                    <h6>{zeroPad(hours)}</h6> <span>hours</span>
                  </div>
                  :
                  <div className="countdown__item">
                    <h6>{zeroPad(minutes)} </h6>
                    <span>minutes</span>
                  </div>
                  :
                  <div className="countdown__item">
                    <h6>{zeroPad(seconds)}</h6> <span>sec</span>
                  </div>
                </div>
              );
            }}
          />
          <Button
            action="#"
            color="transparent"
            className="-underline"
            content="Shop now"
          />
        </div>
      </div>
    </div>
  );
}
