(() => {
  const openButton = document.getElementById("openLeaderboard");
  const boardOverlay = document.getElementById("leaderboardOverlay");
  const closeButton = document.getElementById("closeLeaderboard");
  const list = document.getElementById("leaderboardList");
  const message = document.getElementById("leaderboardMessage");
  const boardButtons = [...document.querySelectorAll("[data-board-shape]")];
  const nameOverlay = document.getElementById("nameOverlay");
  const nameForm = document.getElementById("nameForm");
  const playerName = document.getElementById("playerName");
  const nameMessage = document.getElementById("nameMessage");
  const nameError = document.getElementById("nameError");
  const submitButton = document.getElementById("submitName");
  const skipButton = document.getElementById("skipName");
  let boardShape = "circle";
  let pending = null;

  async function api(body, shape = state.shape) {
    const options = body ? {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    } : {};
    const url = body ? "/api/leaderboard" : `/api/leaderboard?shape=${encodeURIComponent(shape)}`;
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Leaderboard unavailable.");
    return data;
  }

  function render(leaders) {
    list.replaceChildren();
    if (!leaders.length) {
      message.textContent = "No scores yet. The first spot is waiting.";
      return;
    }
    for (const entry of leaders) {
      const item = document.createElement("li");
      const rank = document.createElement("span");
      const name = document.createElement("strong");
      const score = document.createElement("span");
      rank.className = "rank";
      name.className = "name";
      score.className = "score";
      rank.textContent = `#${entry.rank}`;
      name.textContent = entry.name;
      score.textContent = `${entry.score}%`;
      item.append(rank, name, score);
      list.append(item);
    }
  }

  async function load(shape) {
    boardShape = shape;
    boardButtons.forEach(button => button.classList.toggle("active", button.dataset.boardShape === shape));
    list.replaceChildren();
    message.textContent = "Loading rankings...";
    try {
      const data = await api(null, shape);
      message.textContent = `${shapeNames[shape]} rankings`;
      render(data.leaders);
    } catch (error) {
      message.textContent = error.message;
    }
  }

  async function check(score, shape) {
    try {
      const data = await api({ action: "qualify", score, shape });
      if (!data.qualifies) return;
      pending = { score, shape, tie: data.tie };
      nameMessage.textContent = data.tie
        ? `You tied 20th place with ${score}%. Enter your name, then the server flips a coin for the spot.`
        : `Your ${score}% ${shape} belongs in the global top 20.`;
      nameError.textContent = "";
      playerName.value = localStorage.getItem("perfect-shapes-player-name") || "";
      nameOverlay.hidden = false;
      setTimeout(() => playerName.focus(), 0);
    } catch {
      statusText.textContent = "Score saved locally. Global leaderboard is unavailable.";
    }
  }

  const finishGame = finish;
  finish = function leaderboardFinish(reason) {
    finishGame(reason);
    if (reason === "complete" && state.liveScore > 0) check(state.liveScore, state.shape);
  };

  openButton.addEventListener("click", () => {
    boardOverlay.hidden = false;
    load(state.shape);
    closeButton.focus();
  });
  closeButton.addEventListener("click", () => {
    boardOverlay.hidden = true;
    openButton.focus();
  });
  boardOverlay.addEventListener("click", event => {
    if (event.target === boardOverlay) closeButton.click();
  });
  boardButtons.forEach(button => button.addEventListener("click", () => load(button.dataset.boardShape)));
  skipButton.addEventListener("click", () => {
    nameOverlay.hidden = true;
    pending = null;
  });

  nameForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (!pending) return;
    const name = playerName.value.trim().replace(/\s+/g, " ").slice(0, 18);
    if (!name) {
      nameError.textContent = "Enter a name first.";
      return;
    }
    submitButton.disabled = true;
    submitButton.textContent = pending.tie ? "Flipping coin..." : "Adding...";
    try {
      const submitted = pending;
      const data = await api({ action: "submit", ...submitted, name });
      localStorage.setItem("perfect-shapes-player-name", name);
      nameOverlay.hidden = true;
      pending = null;
      boardOverlay.hidden = false;
      boardShape = submitted.shape;
      render(data.leaders || []);
      message.textContent = data.entered
        ? (data.wonTie ? `Heads! You won the tie and landed at #${data.rank}.` : `You are #${data.rank} in the world for ${submitted.shape}.`)
        : (data.reason === "coin-flip" ? "Tails this time. Your score was worthy; the coin was ruthless." : "The cutoff moved while you entered your name.");
      boardButtons.forEach(button => button.classList.toggle("active", button.dataset.boardShape === submitted.shape));
      closeButton.focus();
    } catch (error) {
      nameError.textContent = error.message;
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Enter leaderboard";
    }
  });

  document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    if (!nameOverlay.hidden) skipButton.click();
    else if (!boardOverlay.hidden) closeButton.click();
  });
})();
