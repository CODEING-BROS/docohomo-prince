import Link from "next/link";
import classNames from "classnames";

export default function Button(props) {
  const {
    action,
    as,
    content,
    color,
    height,
    width,
    className,
    onClick,
    disable,
  } = props;
  return (
    <Link href={disable ? "#" : action}>
      <a
        className={`btn -${classNames(color)} ${classNames(className)}`}
        onClick={onClick}
        style={{
          height: height,
          width: width,
          display:"flex",
          justifyContent:"center",
          alignItems:"center",
          lineHeight: height,
          paddingTop: height && 0,
          paddingBottom: height && 0,
          paddingLeft: width && 0,
          paddingRight: width && 0,
          pointerEvents: disable && none,
        }}
      >
        {content}
      </a>
    </Link>
  );
}
