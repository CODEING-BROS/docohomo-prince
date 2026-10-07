import { useState } from "react";
import classNames from "classnames";
import Lightbox from "react-image-lightbox";

export default function ImageLightbox({ imgSrc, className, alt }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <img
        style={{ cursor: "pointer" }}
        onClick={() => setIsOpen(true)}
        className={classNames(className)}
        src={imgSrc}
        alt={alt}
      />

      {isOpen && (
        <Lightbox mainSrc={imgSrc} onCloseRequest={() => setIsOpen(false)} />
      )}
    </>
  );
}
