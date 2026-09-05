export const INTRO = [
  "В тот день Илья Суслов возвращался домой изрядно навеселе.\nПлан был простой: найти свою дверь, попасть на диван и больше никуда не выходить.",
  "Подъезд казался знакомым. Но коридор всё не заканчивался.\nЗа очередной дверью Илью встречали те же стены, те же лампы… и чужие шаги.",
  "Так Илья оказался в Закулисье Ходынки.\nГде-то здесь была его квартира.\nОставалось добраться до неё раньше, чем до него доберётся кто-то другой.",
];
export const OUTRO = [
  "Наконец Илья добрался до своего логова.\nЗамок щёлкнул. Шаги остались по ту сторону двери.",
  "Теперь можно отдохнуть, полистать тиктоки\nи заняться по-настоящему серьёзными делами.\nНо сначала — полежать.",
];
export class Cinematics {
  constructor({ onComplete, onMode, volume }) {
    Object.assign(this, {
      onComplete,
      onMode,
      volume,
      active: false,
      index: 0,
      time: 0,
      phase: "text",
    });
    this.root = document.getElementById("cinematic");
    this.text = document.getElementById("story-text");
    this.video = document.getElementById("intro-video");
    this.next = document.getElementById("story-next");
    this.play = document.getElementById("video-play");
    this.next.onclick = () => this.advance();
    document.getElementById("story-skip").onclick = () => this.complete();
    this.play.onclick = () => {
      if (this.video.error) this.complete();
      else this.playVideo();
    };
    this.video.onended = () => {
      if (this.active && this.phase === "video") this.complete();
    };
    this.video.onerror = () => {
      if (this.active && this.phase === "video") {
        this.play.hidden = false;
        this.play.textContent = "Видео недоступно · начать игру";
      }
    };
  }
  begin(kind) {
    this.stop();
    this.kind = kind;
    this.active = true;
    this.phase = "text";
    this.index = 0;
    this.time = 0;
    this.root.hidden = false;
    this.video.hidden = true;
    this.text.hidden = false;
    this.next.hidden = false;
    this.play.hidden = true;
    document.getElementById("story-skip").textContent =
      kind === "intro" ? "Пропустить вступление" : "Завершить";
    this.onMode(kind === "intro" ? "story" : "ending");
    this.showText();
  }
  showText() {
    this.text.textContent = (this.kind === "intro" ? INTRO : OUTRO)[this.index];
    this.text.style.opacity = "0";
  }
  update(dt) {
    if (!this.active || document.hidden || this.phase !== "text") return;
    this.time += dt;
    const duration = this.kind === "intro" ? 8 : 8.5;
    this.text.style.opacity = String(
      Math.max(0, Math.min(1, this.time / 0.9, (duration - this.time) / 0.9)),
    );
    if (this.time >= duration) this.advance();
  }
  advance() {
    if (!this.active) return;
    if (this.phase === "video") {
      this.complete();
      return;
    }
    this.index++;
    this.time = 0;
    if (this.index < (this.kind === "intro" ? INTRO : OUTRO).length) {
      this.showText();
      return;
    }
    if (this.kind === "ending") {
      this.complete();
      return;
    }
    this.phase = "video";
    this.text.hidden = true;
    this.next.hidden = true;
    this.video.hidden = false;
    this.onMode("video");
    this.video.currentTime = 0;
    this.playVideo();
  }
  playVideo() {
    this.video.volume = this.volume();
    this.play.hidden = true;
    this.video.play().catch(() => {
      if (this.active) {
        this.play.hidden = false;
        this.play.textContent = "Смотреть катсцену";
      }
    });
  }
  suspend() {
    if (this.active && this.phase === "video") {
      this.video.pause();
      this.play.hidden = false;
      this.play.textContent = "Продолжить видео";
    }
  }
  complete() {
    if (!this.active) return;
    const kind = this.kind;
    this.stop();
    this.onComplete(kind);
  }
  stop() {
    this.active = false;
    this.video.pause();
    this.root.hidden = true;
    this.play.hidden = true;
  }
}
