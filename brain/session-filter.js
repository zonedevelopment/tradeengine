function getSession() {

    const now = new Date();

    const hour = (now.getUTCHours() + 7) % 24;

    const london = hour >= 14 && hour <= 18;

    const newyork = hour >= 19 && hour <= 24;

    return {
        active: london || newyork,
        london,
        newyork
    };

}

module.exports = { getSession }