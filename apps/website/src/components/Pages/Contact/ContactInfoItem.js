import classNames from "classnames";
import Link from "next/link";

export default function ContactInfoItem({ iconClass, title, detail }) {
  return (
    <div className="contact-info__item">
      <div className="contact-info__item__icon">
        <i className={classNames(iconClass)} />
      </div>
      <div className="contact-info__item__detail">
        <h3>{title}</h3>
        {title=="Phone"?<>
        <span><a href={`tel:${detail[0]}`}>{detail[0]}</a></span> / <span><a href={`tel:${detail[1]}`}>{detail[1]}</a></span>
        </>
        :<p>{detail}</p>}
      </div>
    </div>
  );
}
