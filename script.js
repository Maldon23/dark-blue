let scale = 40;
let maxStep = 0.05;
let wobbleSpeed = 8;
let wobbleDist = 0.07;
let playerXSpeed = 7;
let gravity = 30;
let jumpSpeed = 14;
let gameSpeed = 1;
const arrowsMap = {
    "playerUp": ["KeyW", "ArrowUp"],
    "playerDown": ["KeyD", "ArrowDown"],
    "playerLeft": ["KeyA", "ArrowLeft"],
    "playerRight": ["KeyD", "ArrowRight"],
    "pause": ["Escape"]
};
let playerCheckpoint;
let deathCount = 0;
const backgroundColor = (level) =>
    level.status === "won" ? "rgb(68, 191, 255)" :
        level.status === "lost" ? "rgb(44, 136, 214)" :
            "rgb(52, 166, 251)";
let lavaColor = "#f00";
const arrows = trackKeys(arrowsMap);
let isPause = false;

let touchUp = false;
let touchLeft = false;
let touchRight = false;

Math.lerp = (t, a, b) =>
    a + (b - a) * t;

class Level {
    width;
    height;
    grid = [];
    actors = [];
    player;
    status = null;
    finishDelay = null;

    constructor(plan) {
        this.width = plan[0].length;
        this.height = plan.length;

        for (let y = 0; y < this.height; y++) {
            let line = plan[y];
            let gridLine = [];
            for (let x = 0; x < this.width; x++) {
                let ch = line[x], fieldType = null;
                let Actor = actorChars[ch];
                if (Actor)
                    this.actors.push(new Actor(new Vector(x, y), ch, this));
                else if (ch === "x")
                    fieldType = "wall";
                else if (ch === "!")
                    fieldType = "lava";
                gridLine.push(fieldType);
            }
            this.grid.push(gridLine);
        }

        this.player = this.actors.filter(v => v.type === "player")[0];
        playerCheckpoint = {
            playerPos: this.player.pos.clone(),
            gravity,
            jumpSpeed
        };
    }

    isFinished() {
        return this.status != null && this.finishDelay < 0;
    }

    playerTouched(type, pos, level, actor) {
        switch (type) {
            case "monster":
            case "lava": {
                if (this.status == null) {
                    this.status = "lost";
                    this.finishDelay = 1;
                    level.actors.push(new DeadMarker(pos));
                }
                return true;
            }
            case "coin": {
                this.actors = this.actors.filter(v => v !== actor);
                if (!this.actors.some(v => v.type === "coin")) {
                    this.status = "won";
                    this.finishDelay = 1;
                }
                return false;
            }
            case "wall": {
                return true;
            }
            case "checkpoint": {
                if (actor.enable !== false) {
                    this.actors
                        .filter(v => v !== actor && v.type === "checkpoint")
                        .forEach(v => v.enable = true);
                    actor.enable = false;
                    playerCheckpoint = {
                        playerPos: actor.basePos,
                        gravity,
                        jumpSpeed
                    };
                }
                return false;
            }
            case "antigravity": {
                actor.enable = false;
                actor.lastUse = 1;
                gravity = -gravity;
                jumpSpeed = -jumpSpeed;
                return false;
            }
        }
    }

    obstacleAt(pos, size) {
        let xStart = Math.floor(pos.x);
        let xEnd = Math.ceil(pos.x + size.x);
        let yStart = Math.floor(pos.y);
        let yEnd = Math.ceil(pos.y + size.y);

        if (xStart < 0 || xEnd > this.width || yStart < 0)
            return "wall";
        if (yEnd > this.height)
            return "lava";
        for (let y = yStart; y < yEnd; y++) {
            for (let x = xStart; x < xEnd; x++) {
                let fieldType = this.grid[y][x];
                if (fieldType) return fieldType;
            }
        }
    }

    actorAt(actor) {
        return this.actors.find(other =>
            other !== actor &&
            actor.pos.x + actor.size.x > other.pos.x &&
            actor.pos.x < other.pos.x + other.size.x &&
            actor.pos.y + actor.size.y > other.pos.y &&
            actor.pos.y < other.pos.y + other.size.y
        );
    }

    animate(step, time, keys) {
        if (this.status != null)
            this.finishDelay -= step;

        while (step > 0) {
            let thisStep = Math.min(step, maxStep);
            this.actors.forEach(function (actor) {
                if (actor.act) {
                    actor.act(thisStep, time, this, keys);
                }
            }, this);
            step -= thisStep;
        }
    }
}

class Vector {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }

    plus(other) {
        return new Vector(this.x + other.x, this.y + other.y);
    }

    times(factor) {
        return new Vector(this.x * factor, this.y * factor);
    }

    clone() {
        return new Vector(this.x, this.y);
    }
}

class CanvasDisplay {
    canvas;
    level;
    cx;
    camPos;
    viewport;

    constructor(parent, level) {
        this.canvas = document.createElement("canvas");

        this.level = level;
        this.camPos = this.level.player.pos;

        this.updateCanvasSize();

        parent.appendChild(this.canvas);
        this.cx = this.canvas.getContext("2d");

        this.drawFrame(0);
        addEventListener("resize", () => {
            this.updateCanvasSize();
            this.updateViewport();
        });
    }

    clear() {
        this.canvas.parentNode.removeChild(this.canvas);
    }

    drawFrame(step, time) {
        lavaColor = `hsl(${ Math.lerp(Math.abs((time / 5000) % 2 - 1), 0, 20) },100%,${ Math.lerp(Math.abs((time / 2000) % 2 - 1), 50, 70) }%)`;

        this.updateViewport();
        this.clearDisplay();
        this.drawBackground(step, time);
        this.drawActors(step, time);
    }

    updateCanvasSize() {
        const width = window.innerWidth || document.documentElement.clientWidth ||
            document.body.clientWidth;
        const height = window.innerHeight || document.documentElement.clientHeight ||
            document.body.clientHeight;

        this.canvas.width = Math.min(width, this.level.width * scale);
        this.canvas.height = Math.min(height, this.level.height * scale);

        this.viewport = {
            left: 0,
            top: 0,
            width: this.canvas.width / scale,
            height: this.canvas.height / scale
        };
    }

    updateViewport() {
        let view = this.viewport;
        let margin = { w: view.width / 2.2, h: view.height / 2.2 };
        let player = this.level.player;
        let center = player.pos.plus(player.size.times(0.5));

        if (center.x < view.left + margin.w)
            view.left = Math.max(center.x - margin.w, 0);
        else if (center.x > view.left - margin.w + view.width)
            view.left = Math.min(center.x + margin.w - view.width, this.level.width - view.width);
        if (center.y < view.top + margin.h)
            view.top = Math.max(center.y - margin.h, 0);
        else if (center.y > view.top - margin.h + view.height)
            view.top = Math.min(center.y + margin.h - view.height, this.level.height - view.height);
    }

    clearDisplay() {
        this.cx.fillStyle = backgroundColor(this.level);
        this.cx.fillRect(0, 0,
            this.canvas.width, this.canvas.height);
    }

    drawBackground(step, time) {
        let view = this.viewport;
        let xStart = Math.floor(view.left);
        let xEnd = Math.ceil(view.left + view.width);
        let yStart = Math.floor(view.top);
        let yEnd = Math.ceil(view.top + view.height);

        for (let y = yStart; y < yEnd; y++) {
            for (let x = xStart; x < xEnd; x++) {
                let tile = this.level.grid[y][x];
                if (tile == null) continue;
                let screenX = Math.floor((x - view.left) * scale);
                let screenY = Math.floor((y - view.top) * scale);
                let color = "#ff00ff";
                switch (tile) {
                    case "lava":
                        color = lavaColor;
                        break;
                    case "wall":
                        color = "#eee";
                        break;
                }
                this.cx.fillStyle = color;
                this.cx.fillRect(screenX, screenY, scale, scale);
            }
        }
    }

    drawActors(step, time) {
        for (const actor of this.level.actors) {
            let width = (actor.size && actor.size.x ? actor.size.x : 1) * scale;
            let height = (actor.size && actor.size.y ? actor.size.y : 1) * scale;
            let x = (actor.pos.x - this.viewport.left) * scale;
            let y = (actor.pos.y - this.viewport.top) * scale;
            let form = "square";
            let color = "#ff00ff";
            switch (actor.type) {
                case "lava":
                    color = actor.enable === false ? "rgba(160,64,64,0.6)" : lavaColor;
                    break;
                case "coin":
                    color = "#F1E559";
                    break;
                case "dead-marker":
                    color = "rgba(64,64,64,0.25)";
                    break;
                case "checkpoint":
                    color = actor.enable === false ? "rgba(10,205,2,0.67)" : "#0ACD02";
                    break;
                case "wall":
                    color = actor.enable === false ? "rgba(238,238,238,0.6)" : "#eee";
                    break;
                case "player":
                    color = "#404040";
                    break;
                case "antigravity":
                    color = actor.enable === false ? "rgba(170,170,170,0.67)" : "#7A00BA";
                    break;
                case "monster": {
                    color = "#e3007d";
                    form = "circle";
                    break;
                }
            }
            this.cx.fillStyle = color;
            switch (form) {
                case "square":
                    this.cx.fillRect(x, y, width, height);
                    break;
                case "circle":
                    this.cx.beginPath();
                    this.cx.arc(x + width / 2, y + height / 2, width / 2, 0, 2 * Math.PI, true);
                    this.cx.fill();
                    break;
            }
        }
    }
}

class Actor {
    pos = { x: 1, y: 1 };
    size = { x: 1, y: 1 };

    constructor(pos) {
        if (pos)
            this.pos = pos;
    }
}

class Player extends Actor {
    constructor(pos) {
        super(pos);

        this.pos = pos.plus(new Vector(0, -0.5));
        this.size = new Vector(1, 1); //ajust player size
        this.speed = new Vector(0, 0);
        this.type = "player";
    }

    moveX(step, level, keys) {
        this.speed.x = 0;
        if (keys.isHold("playerLeft") || touchLeft)
            this.speed.x -= playerXSpeed;
        if (keys.isHold("playerRight") || touchRight)
            this.speed.x += playerXSpeed;

        let motion = new Vector(this.speed.x * step, 0);
        let newPos = this.pos.plus(motion);
        let obstacle = level.obstacleAt(newPos, this.size);
        if (obstacle)
            level.playerTouched(obstacle, newPos, level);
        else
            this.pos = newPos;
    }

    moveY(step, level, keys) {
        this.speed.y += step * gravity;
        let motion = new Vector(0, this.speed.y * step);
        let newPos = this.pos.plus(motion);
        let obstacle = level.obstacleAt(newPos, this.size);
        if (obstacle) {
            level.playerTouched(obstacle, newPos, level);
            if ((keys.isHold("playerUp") || touchUp) && ((gravity < 0 && this.speed.y < 0) || (gravity > 0 && this.speed.y > 0)))
                this.speed.y = -jumpSpeed;
            else
                this.speed.y = 0;
        } else {
            this.pos = newPos;
        }
    }

    act(step, time, level, keys) {
        if (level.status === "lost") {
            this.pos.y += step;
            this.size.y -= step;
        } else {
            this.moveX(step, level, keys);
            this.moveY(step, level, keys);
        }

        let otherActor = level.actorAt(this);
        if (otherActor && otherActor.enable !== false)
            level.playerTouched(otherActor.type, this.pos.clone(), level, otherActor);
    }
}

class BlinkLava extends Actor {
    constructor(pos, ch) {
        super(pos);

        this.pos = pos;
        this.size = new Vector(1, 1);
        this.blink1 = ch === "(";
        this.type = "lava";
    }

    act(step, time, level) {
        this.enable = (this.blink1 ^ (time % 2000 >= 1000)) === 1;
    }
}

class Lava extends Actor {
    constructor(pos, ch) {
        super(pos);

        this.pos = pos;
        this.size = new Vector(1, 1);
        this.speed = new Vector(0, 0);
        if (ch === "=") {
            this.speed = new Vector(2, 0);
        } else if (ch === "|") {
            this.speed = new Vector(0, 2);
        } else if (ch === "v") {
            this.speed = new Vector(0, 3);
            this.repeatPos = pos;
        }
        this.type = "lava";
    }

    act(step, time, level) {
        let newPos = this.pos.plus(this.speed.times(step));
        if (!level.obstacleAt(newPos, this.size))
            this.pos = newPos;
        else if (this.repeatPos)
            this.pos = this.repeatPos;
        else
            this.speed = this.speed.times(-1);
    }
}

class Coin extends Actor {
    constructor(pos) {
        super(pos);

        this.basePos = this.pos = pos.plus(new Vector(0.2, 0.1));
        this.size = new Vector(0.6, 0.6);
        this.wobble = Math.random() * Math.PI * 2;
        this.type = "coin";
    }

    act(step) {
        this.wobble += step * wobbleSpeed;
        let wobblePos = Math.sin(this.wobble) * wobbleDist;
        this.pos = this.basePos.plus(new Vector(0, wobblePos));
    }
}

class DeadMarker extends Actor {
    constructor(pos) {
        super(pos);

        this.size = new Vector(0.8, 1.5);
        this.type = "dead-marker";
    }
}

class Checkpoint extends Actor {
    constructor(pos) {
        super(pos);

        this.pos = pos;
        this.basePos = pos.plus(new Vector(0.1, 0.1));
        this.size = new Vector(0.8, 0.8);
        this.baseSize = new Vector(0.8, 0.8);
        this.wobble = Math.random() * Math.PI * 2;
        this.type = "checkpoint";
    }

    act(step, time, level) {
        if (this.enable !== false) {
            this.wobble += step * wobbleSpeed;
            let wobblePos = Math.sin(this.wobble) * wobbleDist;
            this.size = this.baseSize.plus(new Vector(wobblePos, wobblePos));
            this.pos = this.basePos.plus(new Vector(-wobblePos / 2, -wobblePos / 2));
        } else if (this.size.x !== 0.6) {
            this.size = new Vector(0.6, 0.6);
            this.pos = this.basePos.plus(new Vector(0.1, 0.1));
        }
    }
}

class Antigravity extends Actor {
    constructor(pos) {
        super(pos);

        this.pos = pos;
        this.basePos = pos.plus(new Vector(0.1, 0.3));
        this.size = new Vector(0.8, 0.3);
        this.wobble = Math.random() * Math.PI * 2;
        this.lastUse = 0;
        this.type = "antigravity";
    }

    act(step, time, level) {
        if (this.enable !== false) {
            this.wobble += step * wobbleSpeed;
            let wobblePos = Math.sin(this.wobble) * wobbleDist;
            this.pos.y = this.basePos.y + wobblePos;
        } else if (this.lastUse <= 0) {
            this.enable = true;
        } else {
            this.lastUse -= step;
        }
    }
}

class Monster extends Actor {
    pos;
    level;
    speed = 1;
    wobble = Math.random() * Math.PI * 2;

    constructor(pos, ch, level) {
        super(pos);
        this.type = "monster";
        this.level = level;
        this.pos = pos;
    }

    act(step) {
        const centerPos = {
            x: this.pos.x + this.size.x / 2,
            y: this.pos.y + this.size.y / 2,
            px: this.level.player.pos.x + this.level.player.size.x / 2,
            py: this.level.player.pos.y + this.level.player.size.y / 2
        };

        const angle = Math.atan2(centerPos.py - centerPos.y, centerPos.px - centerPos.x);
        let playerDist = Math.hypot(centerPos.py - centerPos.y, centerPos.px - centerPos.x);
        const traceStep = 0.6;
        const nx = centerPos.x + Math.cos(angle) * traceStep;
        const ny = centerPos.y + Math.sin(angle) * traceStep;
        const res = this.trace(nx, ny, angle, traceStep, Math.min(playerDist - traceStep * 4, 20));
        if (!res)
            this.pos = this.pos.plus(new Vector(Math.cos(angle), Math.sin(angle)).times(step * this.speed));

        this.wobble += step * 4;
        let wobblePos = Math.sin(this.wobble) * 0.01;
        this.pos = this.pos.plus(new Vector(0, wobblePos));
    }

    trace(x, y, angle, step, limit, history = []) {
        let nx = x + Math.cos(angle) * step;
        let ny = y + Math.sin(angle) * step;
        history.push({ x: nx, y: ny });
        if (0 > nx ||
            nx >= this.level.width ||
            0 > ny ||
            ny >= this.level.height) {
            return true;
        }

        let gnx = Math.floor(nx);
        let gny = Math.floor(ny);

        let blockType = this.level.grid[gny][gnx];
        if (blockType) {
            return true;
        }

        if (limit > 0)
            return this.trace(nx, ny, angle, step, limit - step, history);
        else
            return false;
    }
}

function trackKeys(arrowsMap) {
    let input = Object.create(null);
    let inputFrame = Object.create(null);
    let kkeys = Object.keys(arrowsMap);
    let reInput = Object.create(null);
    let keysMap = Object.create(null);
    for (let k of kkeys) {
        for (let b of arrowsMap[k]) {
            keysMap[k] = {
                name: k,
                onDown: [],
                onUp: []
            };
            reInput[b] = k;
        }
    }

    function handler(event) {
        let keyMap = keysMap[reInput[event.code]];
        if (keyMap) {
            if (event.type === "keydown") {
                if (!inputManager.isMultiDownProtect || !input[keyMap.name]) {
                    input[keyMap.name] = true;
                    inputFrame[keyMap.name] = true;
                    CheckActions(keyMap.onDown);
                }
            } else {
                input[keyMap.name] = false;
                inputFrame[keyMap.name] = false;
                CheckActions(keyMap.onUp);
            }
            event.preventDefault();
        }
    }

    function CheckActions(actionsArray) {
        for (let m = 0; m < actionsArray.length;) {
            let act = actionsArray[m];
            act.callback();
            if (act.once)
                actionsArray.splice(m, 1);
            else
                m++;
        }
    }

    addEventListener("keydown", handler);
    addEventListener("keyup", handler);

    function addKey(actionsArray, key, callback, once) {
        let keyMap = keysMap[key];
        if (!keyMap)
            throw new Error("Key not implemented");
        actionsArray = keyMap[actionsArray];
        if (callback && typeof callback === "function") {
            let oldCallback = actionsArray.find(v => !v.once && v.callback === callback);
            if (!oldCallback)
                actionsArray.push({
                    once: !!once,
                    callback
                });
        } else
            throw new Error("Callback is not function");
    }

    function removeKey(actionsArray, key, callback) {
        let keyMap = keysMap[key];
        if (!keyMap)
            throw new Error("Key not implemented");
        actionsArray = keyMap[actionsArray];
        if (callback && typeof callback === "function") {
            for (let m = 0; m < actionsArray.length;) {
                let act = actionsArray[m];
                if (act.callback === callback)
                    actionsArray.splice(m, 1);
                else
                    m++;
            }
        } else
            throw new Error("Callback is not function");
    }

    let inputManager = {};
    inputManager.isMultiDownProtect = true;
    inputManager.isHold = (key) =>
        input[key] === true;
    inputManager.isUp = (key) =>
        inputFrame[key] === false;
    inputManager.onUp = {};
    inputManager.onUp.add = (key, callback, once = false) =>
        addKey("onUp", key, callback, once);
    inputManager.onUp.once = (key, callback) =>
        addKey("onUp", key, callback, true);
    inputManager.onUp.remove = (key, callback) =>
        removeKey("onUp", key, callback);
    inputManager.isDown = (key) =>
        inputFrame[key] === true;
    inputManager.onDown = {};
    inputManager.onDown.add = (key, callback, once = false) =>
        addKey("onDown", key, callback, once);
    inputManager.onDown.once = (key, callback) =>
        addKey("onDown", key, callback, true);
    inputManager.onDown.remove = (key, callback) =>
        removeKey("onDown", key, callback);
    inputManager.resetFrame = () =>
        inputFrame = Object.create(null);
    return inputManager;
}

function runAnimation(frameFunc) {
    let lastTime = 0;
    let totalTime = 0;

    function frame(time) {
        let stop = false;
        let timeStep = Math.min((time - lastTime) * gameSpeed, 50);
        totalTime += timeStep;
        stop = frameFunc(timeStep / 1000, totalTime) === false;
        lastTime = time;

        arrows.resetFrame();
        if (!stop && !isPause)
            requestAnimationFrame(frame);
    }

    arrows.onDown.add("pause", () => {
        isPause = !isPause;
        console.log("isPause", isPause);
        if (!isPause)
            requestAnimationFrame(frame);
    });

    requestAnimationFrame(frame);
}

function runLevel(level, Display, andThen) {
    let display = new Display(document.body, level);
    runAnimation(function (step, time) {
        level.animate(step, time, arrows);
        display.drawFrame(step, time);
        if (level.isFinished()) {
            if (level.status === "lost") {
                let player = level.actors.find(v => v.type === "player");
                player.pos = playerCheckpoint.playerPos.clone();
                gravity = playerCheckpoint.gravity;
                jumpSpeed = playerCheckpoint.jumpSpeed;
                deathCount++;
                console.log(`Deaths: ${ deathCount }`);
                player.size.y = 1.5;
                level.status = level.finishDelay = null;
            } else {
                display.clear();
                if (andThen)
                    andThen(level.status);
                return false;
            }
        }
    });
}

function runGame(plans, Display) {
    function startLevel(n) {
        runLevel(new Level(plans[n]), Display, function (status) {
            gravity = 30;
            jumpSpeed = 14;
            if (status === "lost")
                startLevel(n);
            else if (n < plans.length - 1)
                startLevel(n + 1);
            else {
                let message = `You win! Deaths: ${ deathCount }`;
                console.log(message);
                alert(message);
                deathCount = 0;
                scale /= 2;
                startLevel(0);
            }
        });
    }

    startLevel(0);
}

function Input(inputs, enable = true) {
    if (!enable) {
        touchLeft = false;
        touchRight = false;
        touchUp = false;
        return;
    }

    let btns = {
        up: false,
        left: false,
        right: false
    };
    const width = window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth;
    for (const input of inputs) {
        let posX = input.clientX / width;
        if (posX < 0.25)
            btns.left = true;
        else if (posX < 0.5)
            btns.right = true;
        else
            btns.up = true;
    }

    touchUp = btns.up;
    if (btns.left) {
        touchLeft = true;
        touchRight = false;
    } else {
        touchLeft = false;
        touchRight = btns.right;
    }
}

const actorChars = {
    "@": Player,
    "o": Coin,
    "m": Monster,
    "c": Checkpoint,
    "^": Antigravity,
    "(": BlinkLava, ")": BlinkLava,
    "=": Lava, "|": Lava, "v": Lava
};

addEventListener("touchstart", e => {
    e.preventDefault();
    Input(e.touches);
});
addEventListener("touchmove", e => {
    e.preventDefault();
    if (touchLeft || touchRight || touchUp)
        Input(e.touches);
});
addEventListener("touchend", e => {
    e.preventDefault();
    Input(e.touches);
});

addEventListener("mousedown", e => {
    e.preventDefault();
    Input([e]);
});
addEventListener("mousemove", e => {
    e.preventDefault();
    if (touchLeft || touchRight || touchUp)
        Input([e]);
});
addEventListener("mouseup", e => {
    e.preventDefault();
    Input([e], false);
});
