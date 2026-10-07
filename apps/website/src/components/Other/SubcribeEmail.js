import MailchimpSubscribe from "react-mailchimp-subscribe";
import classNames from "classnames";

const CustomForm = ({
  status,
  message,
  onValidated,
  alertColor,
  className,
  placeholder,
  btnContent,
  children,
}) => {
  let email;
  const submit = () => {
    email &&
      email.value.indexOf("@") > -1 &&
      onValidated({
        EMAIL: email.value,
      });
  };

  function renderStatus(stt) {
    switch (stt) {
      case "sending":
        return (
          <div
            style={{
              color: alertColor,
              fontSize: "14px",
              marginTop: "15px",
              lineHeight: "1.3",
            }}
          >
            sending...
          </div>
        );
      case "error":
        return (
          <div
            style={{
              color: alertColor,
              fontSize: "14px",
              marginTop: "15px",
              lineHeight: "1.3",
            }}
            dangerouslySetInnerHTML={{ __html: message }}
          />
        );
      case "success":
        return (
          <div
            style={{
              color: alertColor,
              fontSize: "14px",
              marginTop: "15px",
              lineHeight: "1.3",
            }}
            dangerouslySetInnerHTML={{ __html: message }}
          />
        );
      default:
        return null;
    }
  }

  return (
    <div className={`subscribe-form ${classNames(className)}`}>
      <div className="mc-form">
        <input
          id="mc-form-email"
          className="email"
          ref={(node) => (email = node)}
          type="email"
          placeholder={placeholder}
        />
        {children}
        <button className="button" onClick={submit}>
          {btnContent || "Subribe"}
        </button>
      </div>
      {renderStatus(status)}
    </div>
  );
};

const SubscribeEmail = ({
  mailchimpUrl,
  alertColor,
  className,
  placeholder,
  btnContent,
  children,
}) => {
  return (
    <div>
      <MailchimpSubscribe
        url={mailchimpUrl}
        render={({ subscribe, status, message }) => (
          <CustomForm
            className={className}
            status={status}
            message={message}
            onValidated={(formData) => subscribe(formData)}
            alertColor={alertColor}
            placeholder={placeholder}
            btnContent={btnContent}
            children={children}
          />
        )}
      />
    </div>
  );
};

export default SubscribeEmail;
