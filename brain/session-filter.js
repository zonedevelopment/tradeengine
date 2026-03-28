function getSession() {
  const now = new Date();
  const hour = (now.getUTCHours() + 7) % 24;

  const london = hour >= 14 && hour <= 18;
  const newyork = hour >= 19 && hour <= 23;

  let name = "OFF_SESSION";
  if (london) name = "LONDON";
  else if (newyork) name = "NEWYORK";

  return {
    active: london || newyork,
    london,
    newyork,
    name,
    hour,
  };
}

module.exports = { getSession };
