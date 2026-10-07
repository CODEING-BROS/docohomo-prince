import Countdown, { zeroPad } from "react-countdown";

import Button from "../../Control/Button";

export default function DaleOfWeekOne({ subTitle, title, last }) {
  return (
    <div className="dow-one">
      <div className="dow-one__image">
        <img
          src={
            process.env.PUBLIC_URL + "/assets/images/deal_of_week/DOWOne/1.png"
          }
          alt="Dale of the week image"
        />
      </div>
      <div className="dow-one__content">
        <h5>{subTitle}</h5>
        <h3>{title}</h3>
        <Countdown
          date={Date.now() + last}
          renderer={({ days, hours, minutes, seconds }) => {
            return (
              <div className="dow-one__content__countdown">
                <div className="countdown__item">
                  <h6>{zeroPad(days)}</h6> <span>days</span>
                </div>
                <div className="countdown__item">
                  <h6>{zeroPad(hours)}</h6> <span>hours</span>
                </div>
                <div className="countdown__item">
                  <h6>{zeroPad(minutes)} </h6>
                  <span>minutes</span>
                </div>
                <div className="countdown__item">
                  <h6>{zeroPad(seconds)}</h6> <span>sec</span>
                </div>
              </div>
            );
          }}
        />
        <Button
          action={process.env.PUBLIC_URL + "#"}
          color="dark"
          content="Shop now"
        />
      </div>
    </div>
  );
}
