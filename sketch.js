// sketch.js
// Steal My Pet - prototype (p5.js)
// Single-file client-side prototype suitable for GitHub Pages

// ---------- CONFIG ----------
const CANVAS_W = 1100;
const CANVAS_H = 640;

let game; // main game state
let lastSpawnAt = 0;

// ---------- SETUP ----------
function setup() {
  createCanvas(CANVAS_W, CANVAS_H);
  frameRate(60);
  initGame();
  setupUI();
}

// ---------- GAME INITIALIZATION ----------
function initGame() {
  game = {
    coins: 50,
    pets: [], // player's pets
    traps: [], // placed traps (x,y,type)
    thieves: [], // AI thieves
    base: { x: width / 2, y: height - 140, radius: 160, level: 1, defendedScore: 0 },
    leaderboards: {
      mythicOwned: 0,
      topThievesName: "AI Thief",
      topThievesScore: 0,
      baseDefenseScore: 0
    },
    session: {
      steals: 0,
      successfulStealsByAI: 0
    }
  };

  // spawn initial AI thieves
  for (let i = 0; i < 2; i++) {
    game.thieves.push(new Thief(random(80, width - 80), random(60, height / 2)));
  }
}

// ---------- PET CLASS ----------
class Pet {
  constructor(rarity) {
    this.rarity = rarity; // 0..5 (0 common, 5 mythic)
    this.name = Pet.randomName();
    this.pos = createVector(game.base.x + random(-game.base.radius/2, game.base.radius/2),
                            game.base.y + random(-game.base.radius/3, game.base.radius/3));
    this.homeOffset = this.pos.copy().sub(createVector(game.base.x, game.base.y));
    this.size = map(this.rarity, 0, 5, 18, 34);
    this.wanderAngle = random(TWO_PI);
    this.happy = 100;
    this.stolen = false;
    this.screamTimer = 0;
    this.id = floor(random(0, 999999));
    // personality
    this.personality = random(["dozy","curious","boisterous","shy","playful"]);
  }

  static randomName() {
    const names = ["Pip","Momo","Gizmo","Nim","Bix","Luna","Zig","Fenn","Koko","Rumi"];
    return random(names) + "-" + floor(random(10,99));
  }

  update() {
    // wandering around base center-ish if not stolen
    if (!this.stolen) {
      // slight attraction to base center plus small wander
      const center = createVector(game.base.x, game.base.y);
      let target = p5.Vector.add(center, this.homeOffset);
      const jitter = p5.Vector.fromAngle(this.wanderAngle).mult(0.6 + this.rarity*0.05);
      target.add(jitter);
      let dir = p5.Vector.sub(target, this.pos);
      if (dir.mag() > 1) {
        dir.setMag(0.8 + this.rarity*0.02);
        this.pos.add(dir);
      } else {
        this.wanderAngle += random(-0.4, 0.4);
      }
      // update happiness slowly
      this.happy = constrain(this.happy + 0.01, 0, 100);
    } else {
      // when stolen, thief controls it (handled by thief)
      // if scream timer active reduce it
      if (this.screamTimer > 0) this.screamTimer--;
    }
  }

  draw() {
    push();
    translate(this.pos.x, this.pos.y);
    noStroke();
    // halo for mythic/rarity
    if (this.rarity >= 4) {
      fill(255, 230, 140, 80);
      ellipse(0, -this.size*0.6, this.size*1.8, this.size*0.7);
    }
    // body
    fill(...this.colorForRarity());
    ellipse(0, 0, this.size*1.2, this.size);
    // eye(s)
    fill(255);
    ellipse(-this.size*0.15, -this.size*0.08, this.size*0.25, this.size*0.25);
    fill(30);
    ellipse(-this.size*0.15 + (sin(frameCount*0.1+this.id)*0.6), -this.size*0.08, this.size*0.12, this.size*0.12);
    // personality marker
    fill(255, 255, 255, 120);
    textSize(10);
    textAlign(CENTER, TOP);
    text(this.personality, 0, this.size*0.6);
    // scream visual
    if (this.screamTimer > 0) {
      fill(255, 50, 60);
      textSize(14);
      textAlign(CENTER, BOTTOM);
      text("AAA! 😱", 0, -this.size*1.0);
    }
    pop();
  }

  colorForRarity() {
    // colors per rarity
    const pal = [
      [170,210,110], // common
      [120,190,230],
      [220,180,100],
      [200,120,240],
      [255,200,80],
      [170,90,240]  // mythic
    ];
    return pal[this.rarity] || pal[0];
  }

  scream() {
    this.screamTimer = 90;
  }
}

// ---------- TRAP CLASS ----------
class Trap {
  constructor(x,y,type) {
    this.x = x; this.y = y; this.type = type;
    this.active = true;
    this.cooldown = 0;
  }

  draw() {
    push();
    translate(this.x, this.y);
    noStroke();
    if (this.type === "banana") {
      fill(255, 230, 120);
      ellipse(0,0,18,10);
      fill(190,120,40); rect(-6,-2,12,4,3);
    } else if (this.type === "trampoline") {
      fill(140,200,255); ellipse(0,0,30,10);
      fill(100); rect(-12, -2, 24, 6, 4);
    } else if (this.type === "foam") {
      fill(220,240,255); ellipse(0,0,26,26);
      fill(200); textSize(10); textAlign(CENTER,CENTER); text("foam",0,0);
    }
    pop();
  }

  trigger(thief) {
    if (!this.active || this.cooldown > 0) return;
    if (this.type === "banana") {
      // thief slips, huge knockback
      thief.v.mult(0.3);
      thief.velocityAdd(createVector(random(-8,-4), -6));
      thief.stunned = 50;
      this.cooldown = 300;
    } else if (this.type === "trampoline") {
      thief.velocityAdd(createVector(0, -10));
      thief.stunned = 40;
      this.cooldown = 220;
    } else if (this.type === "foam") {
      thief.stealthTimer = 100; // thief blinded for a bit (really slows them)
      thief.speed *= 0.5;
      this.cooldown = 260;
    }
  }

  tick() {
    if (this.cooldown > 0) this.cooldown--;
    if (this.cooldown === 0) this.active = true;
  }
}

// ---------- THIEF AI ----------
class Thief {
  constructor(x,y) {
    this.pos = createVector(x,y);
    this.v = createVector(0,0);
    this.targetPet = null;
    this.speed = 1.8 + random(0.0,0.8);
    this.state = "idle"; // idle, sneaking, carrying, fleeing
    this.carrying = null;
    this.stolenCount = 0;
    this.stunned = 0;
    this.stealthTimer = 0;
    this.vx = 0;
    this.id = floor(random(0,9999));
  }

  update() {
    // cooldowns
    if (this.stunned > 0) { this.stunned--; if (this.stunned===0) this.speed = max(1.6, this.speed); }
    if (this.stealthTimer > 0) { this.stealthTimer--; if (this.stealthTimer===0) this.speed = max(1.6, this.speed); }

    if (this.state === "idle") {
      // occasionally pick a pet and go for it
      if (random() < 0.004 && game.pets.length > 0) {
        // choose a pet not already stolen
        const candidates = game.pets.filter(p => !p.stolen);
        if (candidates.length > 0) {
          this.targetPet = random(candidates);
          this.state = "sneaking";
        }
      } else {
        // wander around top half
        this.pos.x += sin(frameCount*0.01 + this.id) * 0.2;
        this.pos.y += cos(frameCount*0.008 + this.id) * 0.2;
      }
    } else if (this.state === "sneaking") {
      if (!this.targetPet || this.targetPet.stolen) {
        this.state = "idle"; this.targetPet = null; return;
      }
      // move toward the pet
      let dir = p5.Vector.sub(this.targetPet.pos, this.pos);
      const d = dir.mag();
      dir.setMag(this.speed * (this.stealthTimer>0?0.6:1.0));
      this.pos.add(dir);
      // check traps near base. if close to trap, trigger
      for (let t of game.traps) {
        let dd = dist(this.pos.x, this.pos.y, t.x, t.y);
        if (dd < 20) {
          t.trigger(this);
        }
      }
      // if close enough to grab
      if (d < 18 && !this.targetPet.stolen && this.stunned <= 0) {
        // success chance depends on base defense and upgrades
        const defense = game.base.level;
        const stealChance = 0.6 - defense * 0.08 + this.speed*0.02; // lower if defended
        if (random() < stealChance) {
          // steal!
          this.carrying = this.targetPet;
          this.carrying.stolen = true;
          this.carrying.scream();
          this.state = "carrying";
          this.stolenCount++;
          game.session.successfulStealsByAI++;
          game.session.steals++;
          // update scoreboard for thief
          if (this.stolenCount > game.leaderboards.topThievesScore) {
            game.leaderboards.topThievesScore = this.stolenCount;
            game.leaderboards.topThievesName = "AI Thief";
          }
        } else {
          // failed, pet resisted => pet defense increases
          this.stunned = 60;
          // pet gets a short boost away
          this.targetPet.pos.add(createVector(random(-30,30), random(-20,-10)));
        }
      }
    } else if (this.state === "carrying") {
      if (!this.carrying) { this.state = "idle"; return; }
      // carry pet and try to flee away from base toward edges
      const flee = p5.Vector.sub(createVector(40,40), createVector(width/2, height/2));
      // simpler: head to random exit
      let exit = createVector(random(20, width-20), -40); // top edge escape
      let dir = p5.Vector.sub(exit, this.pos).setMag(this.speed*1.2);
      this.pos.add(dir);
      // tether pet to thief
      this.carrying.pos = p5.Vector.lerp(this.carrying.pos, p5.Vector.add(this.pos, createVector(0,-10)), 0.4);
      // if reached top edge -> stash and disappear (simulate successful escape)
      if (this.pos.y < -10) {
        // finalize steal: remove pet from player's list
        const idx = game.pets.indexOf(this.carrying);
        if (idx !== -1) {
          // if mythic, update mythic counter
          if (this.carrying.rarity >= 5) {
            // mythic was stolen
            game.leaderboards.mythicOwned = max(0, game.leaderboards.mythicOwned - 1);
          }
          game.pets.splice(idx,1);
        }
        this.carrying = null;
        this.state = "idle";
      }
    }
  }

  draw() {
    push();
    translate(this.pos.x, this.pos.y);
    // body
    fill(70,40,40);
    ellipse(0,0,18,22);
    // eyes
    fill(255);
    ellipse(-4,-2,5,4);
    ellipse(4,-2,5,4);
    fill(0);
    ellipse(-4,-2,2,2);
    ellipse(4,-2,2,2);
    // label
    fill(255);
    textSize(10);
    textAlign(CENTER, TOP);
    text("Thief", 0, 12);
    pop();
  }

  velocityAdd(v) {
    this.pos.add(v);
  }
}

// ---------- INPUT / UI HOOKS ----------
function setupUI() {
  select("#btnHatch").mousePressed(()=> hatchPet());
  select("#btnTrapBan").mousePressed(()=> buyTrap("banana"));
  select("#btnTrapTramp").mousePressed(()=> buyTrap("trampoline"));
  select("#btnTrapFoam").mousePressed(()=> buyTrap("foam"));
  select("#btnUpgrade").mousePressed(()=> upgradeBase());
  updateUI();
}

function updateUI(){
  select("#coins").html("Coins: " + game.coins);
  select("#petCount").html(game.pets.length);
  const myth = game.pets.filter(p=>p.rarity>=5).length;
  select("#mythicCount").html(myth);
  select("#lbMostMythic").html("Most Mythic Pets: you " + myth);
  select("#lbTopThieves").html("Top Thieves: " + game.leaderboards.topThievesName + " " + game.leaderboards.topThievesScore);
  select("#lbBestBase").html("Most Defended Base: you " + game.base.level);
}

// ---------- CORE ACTIONS ----------
function hatchPet() {
  if (game.coins < 20) return showPopup("Need 20 coins to hatch!");
  game.coins -= 20;
  // rarities: weighted distribution
  const r = random();
  let rarity = 0;
  if (r < 0.55) rarity = 0;         // common
  else if (r < 0.78) rarity = 1;    // uncommon
  else if (r < 0.9) rarity = 2;     // rare
  else if (r < 0.97) rarity = 3;    // epic
  else if (r < 0.995) rarity = 4;   // legendary
  else rarity = 5;                  // mythic (very rare)

  const p = new Pet(rarity);
  game.pets.push(p);
  if (rarity === 5) game.leaderboards.mythicOwned++;
  // reward small coins occasionally
  if (random() < 0.4) game.coins += 6;
  updateUI();
  showPopup("Hatched " + p.name + " (" + rarityName(rarity) + ")");
}

function rarityName(r) {
  return ["Common","Uncommon","Rare","Epic","Legendary","Mythic"][r] || "Common";
}

function buyTrap(type) {
  const cost = (type==="banana"?15: type==="trampoline"?25:20);
  if (game.coins < cost) return showPopup("Not enough coins");
  // place trap near base randomly for simplicity (player can't pick spot in prototype)
  const angle = random(0, TWO_PI);
  const distFromBase = random(game.base.radius*0.25, game.base.radius*0.9);
  const x = game.base.x + cos(angle) * distFromBase;
  const y = game.base.y + sin(angle) * distFromBase;
  game.traps.push(new Trap(x,y,type));
  game.coins -= cost;
  showPopup("Placed " + type + " trap");
  updateUI();
}

function upgradeBase() {
  if (game.coins < 100) return showPopup("Need 100 coins to upgrade");
  game.coins -= 100;
  game.base.level++;
  game.base.radius += 40;
  showPopup("Hideout upgraded!");
  updateUI();
}

// ---------- POPUP (top center) ----------
let popup = null;
let popupTimer = 0;
function showPopup(txt) {
  popup = txt;
  popupTimer = 150;
}

// ---------- MAIN DRAW ----------
function draw() {
  background(140,200,160);
  drawWorld();
  updateGame();
  drawHUD();
  if (popupTimer>0) {
    fill(0,0,0,200);
    rect(width/2 - 180, 8, 360, 36, 8);
    fill(255);
    textAlign(CENTER, CENTER);
    textSize(14);
    text(popup, width/2, 26);
    popupTimer--;
  }
}

function drawWorld() {
  // distant mountains
  push();
  noStroke();
  fill(120,150,160);
  triangle(-20, height, 140, 160, 320, height);
  triangle(240, height, 340, 120, 460, height);
  pop();

  // base area
  push();
  fill(220,210,180,80);
  noStroke();
  ellipse(game.base.x, game.base.y, game.base.radius*2, game.base.radius*1.2);
  pop();

  // draw traps
  for (let t of game.traps) {
    t.draw();
    t.tick && t.tick();
  }

  // draw pets
  for (let p of game.pets) {
    p.update();
    p.draw();
  }

  // draw thieves
  for (let th of game.thieves) {
    th.update();
    th.draw();
  }

  // draw base building
  push();
  translate(game.base.x, game.base.y);
  noFill();
  stroke(90,40,60);
  strokeWeight(2);
  rectMode(CENTER);
  fill(140,100,70);
  rect(0,0, 140 + game.base.level*20, 80 + game.base.level*10, 8);
  fill(255);
  textAlign(CENTER, CENTER);
  textSize(12);
  text("Your Hideout Lvl " + game.base.level, 0, 0);
  pop();

  // spawn coins over time
  if (frameCount % 360 === 0) {
    game.coins += 8 + floor(random(0,8));
    updateUI();
  }

  // occasionally spawn new AI thief
  if (frameCount % 1800 === 0 && game.thieves.length < 4) {
    game.thieves.push(new Thief(random(80, width-80), random(20, height/2)));
    showPopup("New thief appeared!");
  }
}

function updateGame() {
  // thieves may be slowed by traps. Also re-enable trap cooldowns
  for (let t of game.traps) t.tick && t.tick();

  // occasionally reward coins if your base defended
  // defend score increases when thief fails to steal (we approximate)
  // i.e., if a thief got stunned near trap we count it as defend
  // (thin simulation: we increment defendedScore when thief stunned recent)
  for (let th of game.thieves) {
    if (th.stunned === 59) { // just stunned this frame
      game.base.defendedScore += 1;
      game.leaderboards.baseDefenseScore = max(game.leaderboards.baseDefenseScore, game.base.defendedScore);
      updateUI();
    }
    // small chance a thief drops a coin when stunned near base
    if (th.stunned > 0 && random()<0.002) { game.coins += 3; updateUI(); }
  }
}

function drawHUD() {
  // bottom-right help
  push();
  fill(0,0,0,120);
  rect(width-260, height-110, 250, 100, 10);
  fill(255);
  textSize(13);
  textAlign(LEFT, TOP);
  text("Coins: " + game.coins, width-245, height-100);
  text("Pets: " + game.pets.length, width-245, height-78);
  text("AI Steals: " + game.session.successfulStealsByAI, width-245, height-56);
  text("Base Lvl: " + game.base.level, width-245, height-34);
  pop();

  // draw small map legend
  push();
  noStroke();
  fill(255,255,255,180);
  rect(8, height-86, 220, 74, 8);
  fill(0);
  textSize(12);
  text("Legend", 18, height-74);
  fill(80);
  textSize(11);
  text("Pets wander near base. Traps slow thieves. Thieves try to steal and escape.", 18, height-58, 200, 80);
  pop();
}

// ---------- MOUSE for chasing thief (try to click thief to stun) ----------
function mousePressed() {
  // try to click a thief to stun them (player chase mechanic)
  for (let th of game.thieves) {
    if (dist(mouseX, mouseY, th.pos.x, th.pos.y) < 18) {
      th.stunned = 80;
      showPopup("You stunned a thief!");
      return;
    }
  }
}

// ---------- UTIL ----------
function max(a,b){ return (a>b)?a:b; }
