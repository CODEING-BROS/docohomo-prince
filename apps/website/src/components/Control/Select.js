import PropTypes from "prop-types";
import classNames from "classnames";

export default function Select(props) {
  const { options, className, getValue, id, placeholder } = props;
  return (
    <select
      id={id}
      onChange={(e) => getValue(e.target.value)}
      className={`customed-select ${classNames(className)}`}
    >
      {placeholder && (
        <option value="" disabled selected>
          {placeholder}
        </option>
      )}
      {options.map((opt, index) => {
        if (typeof opt === "string") {
          return (
            <option value={opt} key={index}>
              {opt}
            </option>
          );
        } else {
          return (
            <option value={opt.value} key={index}>
              {opt.name}
            </option>
          );
        }
      })}
    </select>
  );
}

Select.propTypes = {
  options: PropTypes.array,
  className: PropTypes.string,
};
