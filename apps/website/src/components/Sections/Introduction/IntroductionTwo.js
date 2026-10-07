import { useState } from "react";

import VideoFrame from "../../Other/VideoFrame";

export default function IntroductionTwo({ data, style }) {
  const [currentChoose, setCurrentChoose] = useState(data[0].name);
  const [currentVideoImg, setCurrentVideoImg] = useState(data[0].videoPoster);
  const [currentVideoSrc, setCurrentVideoSrc] = useState(data[0].videoSrc);

  return (
    <div className="introduction-two" style={style}>
      <VideoFrame poster={currentVideoImg} height={500} src={currentVideoSrc} />
      <div className="introduction-two__content">
        <div className="container">
          {data.map((item, index) => (
            <div
              onMouseOver={() => {
                setCurrentChoose(item.name);
                setCurrentVideoImg(item.videoPoster);
                setCurrentVideoSrc(item.videoSrc);
              }}
              key={index}
              className={`introduction-two__content__item ${
                currentChoose === item.name ? "active" : ""
              }`}
            >
              {!item.description && <span>0{index + 1}.</span>}

              <a
                href={process.env.PUBLIC_URL + "#"}
                onClick={(e) => e.preventDefault()}
              >
                {item.name}
              </a>
              <p>{item.description && item.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
