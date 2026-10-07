import { useState } from "react";
import classNames from "classnames";

import Button from "../Control/Button";
import Modal from "../Control/Modal";

export default function VideoFrame(props) {
  const [showModal, setShowModal] = useState(false);
  let { poster, height, width, src, className } = props;
  height = height || 1080;
  return (
    <>
      <div
        className={`video-frame ${classNames(className)}`}
        style={{ height: height, width: width ? width : (height * 16) / 9 }}
      >
        <div className="video-frame__poster">
          <img src={poster} alt="Video poster" />
        </div>
        <Button
          action="#"
          color="white"
          height="50px"
          width="50px"
          className="-round"
          onClick={(e) => {
            e.preventDefault();
            setShowModal(true);
          }}
          content={<i className="fas fa-play"></i>}
        ></Button>
        <a></a>
      </div>
      <Modal
        showModal={showModal}
        setShowModal={setShowModal}
        height={400}
        width={700}
      >
        <iframe
          src={src}
          frameBorder="0"
          allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </Modal>
    </>
  );
}
