import React from "react";
import { CSSTransition } from "react-transition-group";

import ClientOnlyPortal from "../../common/ClientOnlyPortal";

export default function Modal(props) {
  const { showModal, setShowModal, height, width } = props;
  return (
    <>
      <ClientOnlyPortal selector="#modal">
        <CSSTransition
          in={showModal}
          unmountOnExit
          timeout={200}
          classNames="cart-sidebar"
        >
          <div className="modal" style={{ height: height, width: width }}>
            <div className="modal__wrapper">{props.children}</div>
          </div>
        </CSSTransition>
      </ClientOnlyPortal>
      {showModal && (
        <ClientOnlyPortal selector="#overlay">
          <div
            className="overlay"
            onClick={(e) => {
              setShowModal(false);
            }}
          ></div>
        </ClientOnlyPortal>
      )}
    </>
  );
}
