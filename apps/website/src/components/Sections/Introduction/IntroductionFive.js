import Button from "../../Control/Button";

export default function IntroductionFive() {
  return (
    <div
      className="introduction-five"
      style={{
        backgroundImage: `url(${process.env.PUBLIC_URL}/assets/images/introduction/IntroductionFive/1.png)`,
      }}
    >
      <div className="container">
        <div className="introduction-five__content">
          <h2>
            New items are <br />
            released weekly.
          </h2>
          <Button
            action={process.env.PUBLIC_URL + "/fullwidth-4col"}
            content="All news items"
            color="red"
          />
        </div>
      </div>
    </div>
  );
}
