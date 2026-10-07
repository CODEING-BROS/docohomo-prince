import PropTypes from "prop-types";

export default function Rate({ currentRate }) {
  let arrOfStar = [];
  for (let i = 0; i < 5; i++) {
    if (i >= currentRate) {
      arrOfStar.push(<i key={i} className="far fa-star"></i>);
    } else {
      arrOfStar.push(<i key={i} className="fas fa-star"></i>);
    }
  }
  return <div className="rate">{arrOfStar}</div>;
}

Rate.propTypes = {
  currentRate: PropTypes.number,
};
