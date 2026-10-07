import React from "react";
import SocialIcons from "../../../Other/SocialIcons";

export default function TeamCard({ data }) {
  return (
    <div className="team-card">
      <div className="team-card__avatar">
        <img src={data.image} alt={data.name} />
      </div>
      <div className="team-card__content">
        <h3>{data.name}</h3>
        <h5>{data.position}</h5>
        <p>{data.quote}</p>
        <SocialIcons />
      </div>
    </div>
  );
}
