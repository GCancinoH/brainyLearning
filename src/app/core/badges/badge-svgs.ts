/**
 * Catálogo de SVGs para insignias por tier + mascota de mundo.
 *
 * Cada mundo (categoría) tiene su mascota y 4 etapas de evolución:
 * seed → bronze → silver → gold = huevo → cría → juvenil → adulto
 *
 * Los SVGs son inline para rendimiento y se colorean con currentColor.
 */

export interface BadgeSvgSet {
  seed: string;
  bronze: string;
  silver: string;
  gold: string;
}

export interface CategorySvgSet {
  explorer: string;
  bronze: string;
  silver: string;
  gold: string;
}

export interface EffortSvgSet {
  retry: string;
  explorer: string;
  days: string;
  calm: string;
  firstTry: string;
  help: string;
  perfect: string;
  welcome: string;
}

/** Mascotas por mundo: base + 4 evoluciones */
const MASCOT_SVGS: Record<string, BadgeSvgSet> = {
  // 🚀 Espacio - Comandante Estrella (cohete/astronauta)
  space: {
    seed: `<svg viewBox="0 0 64 64"><g fill="none" stroke="currentColor" stroke-width="2.5">
      <ellipse cx="32" cy="48" rx="18" ry="12"/><!-- huevo -->
      <path d="M32 36c0-6 5-10 11-10s11 4 11 10"/><!-- grieta -->
      <circle cx="28" cy="46" r="1.5"/><circle cx="36" cy="46" r="1.5"/><!-- ojitos -->
    </g></svg>`,
    bronze: `<svg viewBox="0 0 64 64"><g fill="none" stroke="currentColor" stroke-width="2.5">
      <path d="M32 12c-6 0-11 4-11 10s5 10 11 10 11-4 11-10-5-10-11-10z"/><!-- cabeza -->
      <path d="M21 18h22"/><!-- visera -->
      <circle cx="26" cy="20" r="2"/><circle cx="38" cy="20" r="2"/><!-- ojos -->
      <path d="M32 30c0 4 3 7 7 7s7-3 7-7"/><!-- sonrisa -->
      <path d="M32 44v12"/><!-- cuerpo -->
      <path d="M24 48h16"/><!-- brazos -->
    </g></svg>`,
    silver: `<svg viewBox="0 0 64 64"><g fill="none" stroke="currentColor" stroke-width="2.5">
      <ellipse cx="32" cy="20" rx="14" ry="11"/><!-- casco -->
      <path d="M18 20h28"/><!-- visera -->
      <circle cx="25" cy="22" r="2.5"/><circle cx="39" cy="22" r="2.5"/><!-- ojos brillantes -->
      <path d="M32 31c0 5 4 9 9 9s9-4 9-9"/><!-- sonrisa ancha -->
      <path d="M22 38q5-8 15-8 10 0 15 8"/><!-- traje -->
      <path d="M24 46v10"/><path d="M40 46v10"/><!-- botas -->
      <circle cx="32" cy="52" r="6" fill="currentColor" opacity="0.15"/><!-- propulsor -->
    </g></svg>`,
    gold: `<svg viewBox="0 0 64 64"><g fill="none" stroke="currentColor" stroke-width="2.5">
      <ellipse cx="32" cy="18" rx="15" ry="12"/><!-- casco dorado -->
      <path d="M17 18h30"/><!-- visera ancha -->
      <circle cx="24" cy="20" r="3"><animate attributeName="opacity" values="1;0.3;1" dur="2s" repeatCount="indefinite"/></circle>
      <circle cx="40" cy="20" r="3"><animate attributeName="opacity" values="1;0.3;1" dur="2s" repeatCount="indefinite" begin="0.5s"/></circle>
      <path d="M22 28q5-6 15-6 10 0 15 6"/><!-- sonrisa heroica -->
      <path d="M16 36q8-12 20-12 12 0 20 12"/><!-- armadura -->
      <path d="M20 48v12"/><path d="M44 48v12"/><!-- botas cohete -->
      <g transform="translate(32,56)">
        <path d="M-10 0L0 -8L10 0" stroke-width="3"><animate attributeName="stroke-dashoffset" values="0;20" dur="0.5s" repeatCount="indefinite"/></path>
        <path d="M-10 0L0 -8L10 0" stroke-width="3" opacity="0.6"><animate attributeName="stroke-dashoffset" values="20;0" dur="0.5s" repeatCount="indefinite"/></path>
      </g><!-- llamas animadas -->
      <circle cx="32" cy="32" r="18" stroke-width="1" opacity="0.3"><animate attributeName="r" values="18;24" dur="2s" repeatCount="indefinite"/></circle>
      <circle cx="32" cy="32" r="18" stroke-width="1" opacity="0.2"><animate attributeName="r" values="20;26" dur="2s" repeatCount="indefinite" begin="1s"/></circle>
    </g></svg>`,
  },

  // 🌸 Jardín de Sakura - Sakura (flor/cerezo)
  sakura: {
    seed: `<svg viewBox="0 0 64 64"><g fill="none" stroke="currentColor" stroke-width="2.5">
      <ellipse cx="32" cy="48" rx="16" ry="10"/><!-- semilla -->
      <path d="M32 38v-8"/><!-- brote -->
      <path d="M28 34h8"/><path d="M30 30h4"/><!-- hojitas -->
    </g></svg>`,
    bronze: `<svg viewBox="0 0 64 64"><g fill="none" stroke="currentColor" stroke-width="2.5">
      <path d="M32 46c0 6-5 10-11 10s-11-4-11-10"/><!-- maceta -->
      <path d="M32 36c-3-5-7-8-7-13 0-7 6-12 13-12s13 5 13 12c0 5-4 8-7 13"/><!-- planta -->
      <circle cx="25" cy="30" r="4" fill="currentColor" opacity="0.3"/><!-- flor 1 -->
      <circle cx="39" cy="28" r="3.5" fill="currentColor" opacity="0.3"/><!-- flor 2 -->
      <path d="M32 46v-4"/><!-- tallo -->
    </g></svg>`,
    silver: `<svg viewBox="0 0 64 64"><g fill="none" stroke="currentColor" stroke-width="2.5">
      <ellipse cx="32" cy="52" rx="18" ry="8" fill="currentColor" opacity="0.1"/><!-- sombra -->
      <path d="M32 44c0 4-4 8-9 8s-9-4-9-8"/><!-- maceta bonita -->
      <path d="M32 32c-6-8-10-14-10-22 0-10 8-18 18-18s18 8 18 18c0 8-4 14-10 22"/><!-- árbol joven -->
      <g fill="currentColor" opacity="0.4">
        <circle cx="20" cy="20" r="5"/><circle cx="44" cy="18" r="4"/>
        <circle cx="26" cy="14" r="4"/><circle cx="38" cy="26" r="4.5"/>
        <circle cx="32" cy="10" r="3"/><circle cx="22" cy="28" r="3.5"/>
      </g><!-- flores cerezo -->
      <path d="M32 44v-4"/><!-- tronco -->
    </g></svg>`,
    gold: `<svg viewBox="0 0 64 64"><g fill="none" stroke="currentColor" stroke-width="2.5">
      <ellipse cx="32" cy="54" rx="20" ry="8" fill="currentColor" opacity="0.1"/><!-- sombra -->
      <path d="M32 46c0 4-5 8-10 8s-10-4-10-8"/><!-- maceta dorada -->
      <path d="M32 30c-8-10-12-20-12-30 0-12 10-22 22-22s22 10 22 22c0 10-4 20-12 30"/><!-- cerezo majestuoso -->
      <g fill="currentColor" opacity="0.5">
        <circle cx="16" cy="16" r="6"/><circle cx="48" cy="14" r="5"/>
        <circle cx="22" cy="8" r="5"/><circle cx="42" cy="22" r="5"/>
        <circle cx="32" cy="4" r="4"/><circle cx="18" cy="26" r="4"/>
        <circle cx="46" cy="28" r="4"/><circle cx="28" cy="16" r="4"/>
        <circle cx="36" cy="12" r="3"/>
      </g><!-- lluvia de pétalos -->
      <g transform="translate(32,50)">
        <g fill="currentColor" opacity="0.6">
          <circle cx="-20" cy="-30" r="4"><animate attributeName="cy" values="-30;60" dur="3s" repeatCount="indefinite"/></circle>
          <circle cx="0" cy="-40" r="3"><animate attributeName="cy" values="-40;70" dur="3.5s" repeatCount="indefinite" begin="0.5s"/></circle>
          <circle cx="20" cy="-20" r="4"><animate attributeName="cy" values="-20;50" dur="3.2s" repeatCount="indefinite" begin="1s"/></circle>
        </g>
      </g><!-- pétalos cayendo animados -->
      <circle cx="32" cy="30" r="22" stroke-width="1" opacity="0.2"><animate attributeName="r" values="22;28" dur="3s" repeatCount="indefinite"/></circle>
      <circle cx="32" cy="30" r="22" stroke-width="1" opacity="0.15"><animate attributeName="r" values="24;30" dur="3s" repeatCount="indefinite" begin="1.5s"/></circle>
    </g></svg>`,
  },

  // 🐉 Planeta Dragón - Sabio Long (dragón)
  dragon: {
    seed: `<svg viewBox="0 0 64 64"><g fill="none" stroke="currentColor" stroke-width="2.5">
      <ellipse cx="32" cy="48" rx="17" ry="11"/><!-- huevo dragón -->
      <path d="M24 44q4-4 8-4 4 0 8 4"/><!-- grietas -->
      <path d="M40 48q-4-3-8-3-4 0-8 3"/>
      <circle cx="29" cy="46" r="1"/><circle cx="35" cy="46" r="1"/><!-- ojitos dentro -->
    </g></svg>`,
    bronze: `<svg viewBox="0 0 64 64"><g fill="none" stroke="currentColor" stroke-width="2.5">
      <path d="M32 50q-8 0-12-6t-4-12q0-6 4-10t12-4q6 0 10 4t4 10q0 6-4 10t-12 4z"/><!-- cara redonda -->
      <path d="M24 34h16"/><!-- cuernos bebé -->
      <circle cx="26" cy="38" r="2.5"/><circle cx="38" cy="38" r="2.5"/><!-- ojos -->
      <path d="M28 46h8"/><!-- hocico -->
      <path d="M25 52h14"/><!-- sonrisa -->
      <path d="M32 54v8"/><!-- cuerpo -->
    </g></svg>`,
    silver: `<svg viewBox="0 0 64 64"><g fill="none" stroke="currentColor" stroke-width="2.5">
      <path d="M32 18q-6 0-10 4t-4 10q0 6 4 10t10 4q6 0 10-4t4-10q0-6-4-10t-10-4z"/><!-- cabeza -->
      <path d="M18 18q4-6 12-6t12 6"/><!-- cuernos ramificados -->
      <circle cx="25" cy="20" r="3"/><circle cx="39" cy="20" r="3"/><!-- ojos brillantes -->
      <path d="M26 28h12"/><!-- bigotes -->
      <path d="M32 34q-4 4-4 8"/><!-- sonrisa sabia -->
      <path d="M32 42q-8 0-12 6t-4 12q0 6 4 10t12 4q6 0 10-4t4-10q0-6-4-10t-12-4z"/><!-- cuerpo serpenteante -->
      <path d="M20 48h24"/><!-- escamas -->
      <path d="M14 50h6"/><path d="M44 50h6"/><!-- garras -->
    </g></svg>`,
    gold: `<svg viewBox="0 0 64 64"><g fill="none" stroke="currentColor" stroke-width="2.5">
      <path d="M32 14q-8 0-12 5t-4 12q0 7 4 11t12 5q7 0 11-4t5-11q0-7-4-11t-11-5z"/><!-- cabeza imperial -->
      <path d="M16 16q5-8 15-8t15 8"/><!-- cuernos majestuosos -->
      <path d="M22 18q2-3 6-3t6 3"/><!-- sub-cuernos -->
      <circle cx="24" cy="19" r="3.5"><animate attributeName="r" values="3.5;4.5;3.5" dur="1.5s" repeatCount="indefinite"/></circle>
      <circle cx="40" cy="19" r="3.5"><animate attributeName="r" values="3.5;4.5;3.5" dur="1.5s" repeatCount="indefinite" begin="0.75s"/></circle>
      <path d="M24 26h16"/><!-- bigotes largos -->
      <path d="M32 32q-5 5-5 10"/><!-- sonrisa benevolente -->
      <path d="M32 40q-10 0-15 8t-5 14q0 7 5 12t15 5q10 0 15-5t5-12q0-7-5-14t-15-8z"/><!-- cuerpo largo escamoso -->
      <g stroke-width="1.5" opacity="0.5">
        <path d="M20 44h24"/><path d="M20 48h24"/><path d="M20 52h24"/><path d="M20 56h24"/>
      </g><!-- escamas brillantes -->
      <path d="M12 52h8"/><path d="M44 52h8"/><!-- garras doradas -->
      <g transform="translate(32,28)">
        <circle r="2" fill="currentColor" opacity="0.7"><animate attributeName="r" values="2;8;2" dur="2s" repeatCount="indefinite"/></circle>
        <circle r="2" fill="currentColor" opacity="0.5"><animate attributeName="r" values="2;8;2" dur="2s" repeatCount="indefinite" begin="1s"/></circle>
      </g><!-- aura mágica -->
      <circle cx="32" cy="36" r="24" stroke-width="1" opacity="0.2"><animate attributeName="r" values="24;30" dur="3s" repeatCount="indefinite"/></circle>
      <circle cx="32" cy="36" r="24" stroke-width="1" opacity="0.15"><animate attributeName="r" values="26;32" dur="3s" repeatCount="indefinite" begin="1.5s"/></circle>
    </g></svg>`,
  },

  // 📖 Bosque de Cuentos - Búho Lector (lectura/español)
  stories: {
    seed: `<svg viewBox="0 0 64 64"><g fill="none" stroke="currentColor" stroke-width="2.5">
      <rect x="18" y="34" width="28" height="20" rx="2"/><!-- libro cerrado -->
      <path d="M32 34v-8"/><!-- marcapáginas -->
    </g></svg>`,
    bronze: `<svg viewBox="0 0 64 64"><g fill="none" stroke="currentColor" stroke-width="2.5">
      <path d="M32 48c0 4-5 8-11 8s-11-4-11-8"/><!-- base -->
      <path d="M21 48v-20h22v20z"/><!-- libro abierto -->
      <path d="M32 28v-4"/><path d="M26 34h12"/><path d="M26 38h12"/><path d="M26 42h8"/><!-- líneas texto -->
      <circle cx="28" cy="20" r="2"/><circle cx="36" cy="20" r="2"/><!-- ojos búho -->
    </g></svg>`,
    silver: `<svg viewBox="0 0 64 64"><g fill="none" stroke="currentColor" stroke-width="2.5">
      <ellipse cx="32" cy="50" rx="20" ry="6" fill="currentColor" opacity="0.1"/>
      <path d="M18 44h28"/><!-- estante -->
      <path d="M22 44v-18h20v18"/><!-- libro grande -->
      <path d="M32 26v-4"/><path d="M26 32h12"/><path d="M26 36h12"/><path d="M26 40h12"/><path d="M26 40h12"/><!-- texto -->
      <circle cx="26" cy="18" r="3"/><circle cx="38" cy="18" r="3"/><!-- ojos brillantes -->
      <path d="M32 30c-3 0-5 2-5 5s2 5 5 5 5-2 5-5-2-5-5-5z"/><!-- pico -->
      <g opacity="0.3"><circle cx="16" cy="30" r="2"/><circle cx="48" cy="28" r="2"/><circle cx="20" cy="40" r="1.5"/><circle cx="44" cy="36" r="1.5"/></g><!-- polvo mágico -->
    </g></svg>`,
    gold: `<svg viewBox="0 0 64 64"><g fill="none" stroke="currentColor" stroke-width="2.5">
      <ellipse cx="32" cy="52" rx="22" ry="6" fill="currentColor" opacity="0.1"/>
      <path d="M16 42h30"/><!-- estante dorado -->
      <path d="M20 42v-22h24v22"/><!-- libro grande dorado -->
      <path d="M32 20v-4"/><path d="M24 28h16"/><path d="M24 32h16"/><path d="M24 36h16"/><path d="M24 40h12"/><!-- texto dorado -->
      <circle cx="25" cy="16" r="3.5"><animate attributeName="opacity" values="1;0.4;1" dur="2s" repeatCount="indefinite"/></circle>
      <circle cx="39" cy="16" r="3.5"><animate attributeName="opacity" values="1;0.4;1" dur="2s" repeatCount="indefinite" begin="1s"/></circle>
      <path d="M32 30c-3 0-5 2-5 5s2 5 5 5 5-2 5-5-2-5-5-5z"/><!-- pico -->
      <g fill="currentColor" opacity="0.4">
        <circle cx="12" cy="26" r="3"><animate attributeName="cy" values="26;10" dur="2.5s" repeatCount="indefinite"/></circle>
        <circle cx="52" cy="22" r="2.5"><animate attributeName="cy" values="22;8" dur="2.8s" repeatCount="indefinite" begin="0.5s"/></circle>
        <circle cx="18" cy="34" r="2"><animate attributeName="cy" values="34;18" dur="3s" repeatCount="indefinite" begin="1s"/></circle>
        <circle cx="46" cy="30" r="2.5"><animate attributeName="cy" values="30;14" dur="2.7s" repeatCount="indefinite" begin="1.5s"/></circle>
      </g><!-- letras volando -->
      <circle cx="32" cy="26" r="24" stroke-width="1" opacity="0.2"><animate attributeName="r" values="24;30" dur="3s" repeatCount="indefinite"/></circle>
      <circle cx="32" cy="26" r="24" stroke-width="1" opacity="0.15"><animate attributeName="r" values="26;32" dur="3s" repeatCount="indefinite" begin="1.5s"/></circle>
    </g></svg>`,
  },

  // 🔬 Laboratorio - Profe Lab (inglés/ciencias)
  lab: {
    seed: `<svg viewBox="0 0 64 64"><g fill="none" stroke="currentColor" stroke-width="2.5">
      <path d="M22 48h20"/><path d="M28 48v-20h8v20"/><path d="M24 36h16"/><!-- matraz -->
      <path d="M32 28v-6"/><!-- burbuja -->
    </g></svg>`,
    bronze: `<svg viewBox="0 0 64 64"><g fill="none" stroke="currentColor" stroke-width="2.5">
      <path d="M20 50h24"/><path d="M26 50v-22h12v22"/><path d="M22 38h20"/><!-- matraz con base -->
      <path d="M32 28v-8"/><circle cx="32" cy="18" r="4"/><!-- burbuja grande -->
      <circle cx="28" cy="14" r="2"/><circle cx="36" cy="16" r="1.5"/><!-- burbujitas -->
      <circle cx="29" cy="38" r="2"/><circle cx="35" cy="38" r="2"/><!-- gafas -->
      <path d="M29 42h6"/><!-- sonrisa -->
    </g></svg>`,
    silver: `<svg viewBox="0 0 64 64"><g fill="none" stroke="currentColor" stroke-width="2.5">
      <ellipse cx="32" cy="52" rx="20" ry="6" fill="currentColor" opacity="0.1"/>
      <path d="M18 48h28"/><path d="M24 48v-24h16v24"/><path d="M20 34h24"/><!-- matraz grande -->
      <path d="M32 24v-10"/><circle cx="32" cy="12" r="6"/><!-- burbuja principal -->
      <g fill="currentColor" opacity="0.4">
        <circle cx="26" cy="10" r="3"/><circle cx="38" cy="14" r="2.5"/>
        <circle cx="22" cy="18" r="2"/><circle cx="42" cy="16" r="2"/>
        <circle cx="30" cy="6" r="1.5"/><circle cx="38" cy="8" r="1.5"/>
      </g><!-- burbujas subiendo -->
      <circle cx="27" cy="36" r="3"/><circle cx="37" cy="36" r="3"/><!-- gafas ciencia -->
      <path d="M27 42h10"/><!-- sonrisa ancha -->
      <path d="M16 40h4"/><path d="M44 40h4"/><path d="M16 46h4"/><path d="M44 46h4"/><!-- tubos ensayo -->
    </g></svg>`,
    gold: `<svg viewBox="0 0 64 64"><g fill="none" stroke="currentColor" stroke-width="2.5">
      <ellipse cx="32" cy="54" rx="22" ry="6" fill="currentColor" opacity="0.1"/>
      <path d="M16 46h30"/><path d="M22 46v-26h20v26"/><path d="M18 32h28"/><!-- matraz dorado -->
      <path d="M32 20v-12"/><circle cx="32" cy="6" r="8"/><!-- burbuja mágica -->
      <g fill="currentColor" opacity="0.5">
        <circle cx="24" cy="4" r="3.5"><animate attributeName="cy" values="4;20" dur="1.5s" repeatCount="indefinite"/></circle>
        <circle cx="40" cy="10" r="3"><animate attributeName="cy" values="10;24" dur="1.8s" repeatCount="indefinite" begin="0.3s"/></circle>
        <circle cx="20" cy="16" r="2.5"><animate attributeName="cy" values="16;30" dur="2s" repeatCount="indefinite" begin="0.6s"/></circle>
        <circle cx="44" cy="12" r="2.5"><animate attributeName="cy" values="12;28" dur="1.7s" repeatCount="indefinite" begin="0.9s"/></circle>
        <circle cx="18" cy="22" r="2"><animate attributeName="cy" values="22;36" dur="2.2s" repeatCount="indefinite" begin="1.2s"/></circle>
        <circle cx="46" cy="18" r="2"><animate attributeName="cy" values="18;34" dur="2.1s" repeatCount="indefinite" begin="1.5s"/></circle>
      </g><!-- burbujas subiendo animadas -->
      <circle cx="26" cy="34" r="3.5"><animate attributeName="opacity" values="1;0.5;1" dur="2s" repeatCount="indefinite"/></circle>
      <circle cx="38" cy="34" r="3.5"><animate attributeName="opacity" values="1;0.5;1" dur="2s" repeatCount="indefinite" begin="1s"/></circle>
      <path d="M26 40h10"/><!-- sonrisa científica -->
      <path d="M14 38h6"/><path d="M44 38h6"/><path d="M14 44h6"/><path d="M44 44h6"/><!-- tubos brillantes -->
      <circle cx="32" cy="24" r="26" stroke-width="1" opacity="0.2"><animate attributeName="r" values="26;32" dur="2.5s" repeatCount="indefinite"/></circle>
      <circle cx="32" cy="24" r="26" stroke-width="1" opacity="0.15"><animate attributeName="r" values="28;34" dur="2.5s" repeatCount="indefinite" begin="1.25s"/></circle>
    </g></svg>`,
  },
};

/** Insignias de categoría (mundo) */
export const CATEGORY_SVGS: Record<string, CategorySvgSet> = {
  space: {
    explorer: `<svg viewBox="0 0 64 64"><g fill="none" stroke="currentColor" stroke-width="2.5">
      <circle cx="32" cy="32" r="20"/><!-- órbita -->
      <path d="M32 12v8M32 44v8M12 32h8M44 32h8"/><!-- cruz cardinal -->
      <circle cx="32" cy="32" r="8"/><!-- planeta central -->
      <path d="M32 24a8 8 0 1 1 0 16"/><!-- anillo -->
      <g fill="currentColor"><circle cx="20" cy="28" r="2"/><circle cx="44" cy="36" r="1.5"/><circle cx="40" cy="20" r="1"/></g><!-- lunas -->
    </g></svg>`,
    bronze: `<svg viewBox="0 0 64 64"><g fill="none" stroke="currentColor" stroke-width="2.5">
      <circle cx="32" cy="32" r="22"/><!-- órbita mayor -->
      <circle cx="32" cy="32" r="10" fill="currentColor" opacity="0.15"/><!-- planeta -->
      <path d="M32 22a10 10 0 1 1 0 20"/><!-- anillo -->
      <g fill="currentColor"><circle cx="18" cy="26" r="2.5"/><circle cx="46" cy="38" r="2"/><circle cx="42" cy="20" r="1.5"/></g>
      <path d="M32 10v6M32 48v6M10 32h6M48 32h6" stroke-width="3"/><!-- brillo cardinal -->
    </g></svg>`,
    silver: `<svg viewBox="0 0 64 64"><g fill="none" stroke="currentColor" stroke-width="2.5">
      <circle cx="32" cy="32" r="24"/><!-- órbita completa -->
      <circle cx="32" cy="32" r="12" fill="currentColor" opacity="0"> <animate attributeName="opacity" values="0;0.2;0" dur="3s" repeatCount="indefinite"/></circle>
      <path d="M32 20a12 12 0 1 1 0 24"><animate attributeName="stroke-dashoffset" values="0;75" dur="2s" repeatCount="indefinite"/></path><!-- anillo animado -->
      <g fill="currentColor"><circle cx="16" cy="24" r="3"/><circle cx="48" cy="40" r="2.5"/><circle cx="44" cy="18" r="2"/></g>
      <path d="M32 8v6M32 50v6M8 32h6M50 32h6" stroke-width="4"><animate attributeName="opacity" values="1;0.5;1" dur="1.5s" repeatCount="indefinite"/></path>
    </g></svg>`,
    gold: `<svg viewBox="0 0 64 64"><g fill="none" stroke="currentColor" stroke-width="2.5">
      <circle cx="32" cy="32" r="26"/><!-- órbita suprema -->
      <circle cx="32" cy="32" r="14" fill="currentColor" opacity="0.1"><animate attributeName="opacity" values="0.1;0.3;0.1" dur="2s" repeatCount="indefinite"/></circle>
      <path d="M32 18a14 14 0 1 1 0 28"><animate attributeName="stroke-dashoffset" values="0;88" dur="1.5s" repeatCount="indefinite"/></path><!-- anillo giratorio -->
      <path d="M32 18a14 14 0 1 0 0 28" opacity="0.5"><animate attributeName="stroke-dashoffset" values="88;0" dur="1.5s" repeatCount="indefinite"/></path><!-- anillo inverso -->
      <g fill="currentColor"><circle cx="14" cy="22" r="3.5"/><circle cx="50" cy="42" r="3"/><circle cx="46" cy="16" r="2.5"/></g>
      <path d="M32 6v6M32 52v6M6 32h6M52 32h6" stroke-width="5"><animate attributeName="opacity" values="1;0.4;1" dur="1s" repeatCount="indefinite"/></path>
      <circle cx="32" cy="32" r="28" stroke-width="1" opacity="0.2"><animate attributeName="r" values="28;34" dur="2s" repeatCount="indefinite"/></circle>
      <circle cx="32" cy="32" r="28" stroke-width="1" opacity="0.15"><animate attributeName="r" values="30;36" dur="2s" repeatCount="indefinite" begin="1s"/></circle>
    </g></svg>`,
  },

  sakura: {
    explorer: `<svg viewBox="0 0 64 64"><g fill="none" stroke="currentColor" stroke-width="2.5">
      <path d="M32 50c0 6-8 10-18 10s-18-4-18-10"/><!-- colina -->
      <g fill="currentColor" opacity="0.4"><circle cx="20" cy="36" r="5"/><circle cx="44" cy="34" r="4"/><circle cx="32" cy="30" r="4"/></g><!-- cerezos -->
    </g></svg>`,
    bronze: `<svg viewBox="0 0 64 64"><g fill="none" stroke="currentColor" stroke-width="2.5">
      <path d="M32 52c0 5-10 8-20 8s-20-3-20-8"/><!-- colina -->
      <g fill="currentColor" opacity="0.5"><circle cx="16" cy="34" r="6"/><circle cx="48" cy="32" r="5"/><circle cx="32" cy="28" r="5"/><circle cx="24" cy="38" r="4"/><circle cx="40" cy="36" r="4"/></g>
      <path d="M32 52v-6" stroke-width="3"/><!-- tronco central -->
    </g></svg>`,
    silver: `<svg viewBox="0 0 64 64"><g fill="none" stroke="currentColor" stroke-width="2.5">
      <path d="M32 54c0 4-12 6-22 6s-22-2-22-6"/><!-- colina plateada -->
      <g fill="currentColor" opacity="0.6"><circle cx="14" cy="32" r="7"/><circle cx="50" cy="30" r="6"/><circle cx="32" cy="26" r="6"/><circle cx="20" cy="38" r="5"/><circle cx="44" cy="34" r="5"/><circle cx="28" cy="20" r="4"/></g>
      <path d="M32 54v-8" stroke-width="3"/><!-- tronco -->
      <circle cx="32" cy="36" r="16" stroke-width="1" opacity="0.2"><animate attributeName="r" values="16;22" dur="3s" repeatCount="indefinite"/></circle>
    </g></svg>`,
    gold: `<svg viewBox="0 0 64 64"><g fill="none" stroke="currentColor" stroke-width="2.5">
      <path d="M32 56c0 4-14 6-24 6s-24-2-24-6"/><!-- colina dorada -->
      <g fill="currentColor" opacity="0.7"><circle cx="12" cy="30" r="8"/><circle cx="52" cy="28" r="7"/><circle cx="32" cy="24" r="7"/><circle cx="18" cy="36" r="6"/><circle cx="46" cy="32" r="6"/><circle cx="26" cy="18" r="5"/><circle cx="38" cy="22" r="5"/></g>
      <path d="M32 56v-10" stroke-width="4"/><!-- tronco majestuoso -->
      <g transform="translate(32,46)">
        <g fill="currentColor" opacity="0.6">
          <circle cx="-22" cy="-34" r="4"><animate attributeName="cy" values="-34;30" dur="4s" repeatCount="indefinite"/></circle>
          <circle cx="0" cy="-42" r="3"><animate attributeName="cy" values="-42;38" dur="4.5s" repeatCount="indefinite" begin="1s"/></circle>
          <circle cx="22" cy="-26" r="4"><animate attributeName="cy" values="-26;22" dur="4.2s" repeatCount="indefinite" begin="2s"/></circle>
        </g>
      </g><!-- pétalos cayendo -->
      <circle cx="32" cy="34" r="26" stroke-width="1" opacity="0.2"><animate attributeName="r" values="26;32" dur="3s" repeatCount="indefinite"/></circle>
      <circle cx="32" cy="34" r="26" stroke-width="1" opacity="0.15"><animate attributeName="r" values="28;34" dur="3s" repeatCount="indefinite" begin="1.5s"/></circle>
    </g></svg>`,
  },

  dragon: {
    explorer: `<svg viewBox="0 0 64 64"><g fill="none" stroke="currentColor" stroke-width="2.5">
      <path d="M32 50q-10 0-15-8t-5-14q0-8 5-14t15-8q8 0 14 5t8 13q0 8-5 14t-15 8z"/><!-- montaña dragón -->
      <path d="M32 22q-4 0-6 3t-2 6q0 4 2 6t6 3q4 0 6-3t2-6q0-4-2-6t-6-3z"/><!-- cueva -->
      <path d="M28 24h8"/><path d="M30 20h4"/><!-- entrada -->
    </g></svg>`,
    bronze: `<svg viewBox="0 0 64 64"><g fill="none" stroke="currentColor" stroke-width="2.5">
      <path d="M32 52q-12 0-18-10t-6-16q0-10 6-16t18-10q10 0 16 6t6 14q0 10-6 16t-16 10z"/><!-- montaña -->
      <path d="M32 26q-5 0-7 4t-2 7q0 5 2 7t7 4q5 0 7-4t2-7q0-5-2-7t-7-4z"/><!-- cueva iluminada -->
      <circle cx="32" cy="30" r="4" fill="currentColor" opacity="0.4"><animate attributeName="opacity" values="0.4;1;0.4" dur="2s" repeatCount="indefinite"/></circle><!-- ojo dragón -->
      <path d="M24 18h16"/><path d="M26 14h12"/><!-- cuernos montaña -->
    </g></svg>`,
    silver: `<svg viewBox="0 0 64 64"><g fill="none" stroke="currentColor" stroke-width="2.5">
      <path d="M32 54q-14 0-20-12t-6-18q0-12 6-18t20-12q12 0 18 6t6 16q0 12-6 18t-18 12z"/><!-- montaña plateada -->
      <path d="M32 28q-6 0-8 5t-2 8q0 6 2 8t8 5q6 0 8-5t2-8q0-6-2-8t-8-5z"/><!-- cueva brillante -->
      <circle cx="32" cy="32" r="5" fill="currentColor" opacity="0.6"><animate attributeName="r" values="5;7;5" dur="1.5s" repeatCount="indefinite"/></circle>
      <path d="M22 16h20"/><path d="M24 12h16"/><path d="M26 8h12"/><!-- corona cuernos -->
      <circle cx="32" cy="36" r="18" stroke-width="1" opacity="0.2"><animate attributeName="r" values="18;24" dur="3s" repeatCount="indefinite"/></circle>
    </g></svg>`,
    gold: `<svg viewBox="0 0 64 64"><g fill="none" stroke="currentColor" stroke-width="2.5">
      <path d="M32 56q-16 0-22-14t-6-20q0-14 6-20t22-14q14 0 20 6t6 18q0 14-6 20t-20 14z"/><!-- montaña imperial -->
      <path d="M32 30q-7 0-9 6t-2 9q0 7 2 9t9 6q7 0 9-6t2-9q0-7-2-9t-9-6z"/><!-- cueva sagrada -->
      <circle cx="32" cy="34" r="6" fill="currentColor" opacity="0.8"><animate attributeName="r" values="6;8;6" dur="1s" repeatCount="indefinite"/></circle>
      <path d="M20 14h24"/><path d="M22 10h20"/><path d="M24 6h16"/><path d="M26 2h12"/><!-- corona imperial -->
      <g transform="translate(32,38)">
        <circle r="4" fill="currentColor" opacity="0.5"><animate attributeName="r" values="4;12;4" dur="2s" repeatCount="indefinite"/></circle>
        <circle r="4" fill="currentColor" opacity="0.3"><animate attributeName="r" values="4;12;4" dur="2s" repeatCount="indefinite" begin="1s"/></circle>
      </g><!-- aura imperial -->
      <circle cx="32" cy="38" r="28" stroke-width="1" opacity="0.2"><animate attributeName="r" values="28;34" dur="2.5s" repeatCount="indefinite"/></circle>
      <circle cx="32" cy="38" r="28" stroke-width="1" opacity="0.15"><animate attributeName="r" values="30;36" dur="2.5s" repeatCount="indefinite" begin="1.25s"/></circle>
    </g></svg>`,
  },

  stories: {
    explorer: `<svg viewBox="0 0 64 64"><g fill="none" stroke="currentColor" stroke-width="2.5">
      <path d="M16 48h32"/><path d="M20 48v-16h24v16"/><path d="M32 32v-8"/><!-- estantería -->
      <path d="M24 36h16"/><path d="M24 40h16"/><path d="M24 44h12"/><!-- libros -->
    </g></svg>`,
    bronze: `<svg viewBox="0 0 64 64"><g fill="none" stroke="currentColor" stroke-width="2.5">
      <path d="M14 50h36"/><path d="M18 50v-20h28v20"/><path d="M32 30v-8"/><!-- estantería grande -->
      <path d="M22 38h20"/><path d="M22 42h20"/><path d="M22 46h16"/><path d="M22 46h16"/><!-- libros -->
      <circle cx="26" cy="22" r="3"/><circle cx="38" cy="22" r="3"/><!-- búho guardián -->
    </g></svg>`,
    silver: `<svg viewBox="0 0 64 64"><g fill="none" stroke="currentColor" stroke-width="2.5">
      <ellipse cx="32" cy="52" rx="24" ry="6" fill="currentColor" opacity="0.1"/>
      <path d="M12 46h40"/><path d="M16 46v-24h32v24"/><path d="M32 22v-6"/><!-- biblioteca -->
      <path d="M20 34h24"/><path d="M20 38h24"/><path d="M20 42h24"/><path d="M20 46h24"/><path d="M20 46h24"/><!-- muchos libros -->
      <circle cx="24" cy="18" r="4"/><circle cx="40" cy="18" r="4"/><!-- ojos brillantes -->
      <circle cx="32" cy="30" r="18" stroke-width="1" opacity="0.2"><animate attributeName="r" values="18;24" dur="3s" repeatCount="indefinite"/></circle>
    </g></svg>`,
    gold: `<svg viewBox="0 0 64 64"><g fill="none" stroke="currentColor" stroke-width="2.5">
      <ellipse cx="32" cy="54" rx="26" ry="6" fill="currentColor" opacity="0.1"/>
      <path d="M10 44h44"/><path d="M14 44v-28h36v28"/><path d="M32 16v-6"/><!-- gran biblioteca -->
      <path d="M18 32h28"/><path d="M18 36h28"/><path d="M18 40h28"/><path d="M18 44h28"/><path d="M18 48h28"/><path d="M18 48h28"/><!-- biblioteca infinita -->
      <circle cx="22" cy="14" r="4.5"><animate attributeName="opacity" values="1;0.4;1" dur="2s" repeatCount="indefinite"/></circle>
      <circle cx="42" cy="14" r="4.5"><animate attributeName="opacity" values="1;0.4;1" dur="2s" repeatCount="indefinite" begin="1s"/></circle>
      <g fill="currentColor" opacity="0.5">
        <circle cx="10" cy="24" r="3"><animate attributeName="cy" values="24;8" dur="2s" repeatCount="indefinite"/></circle>
        <circle cx="54" cy="20" r="2.5"><animate attributeName="cy" values="20;6" dur="2.5s" repeatCount="indefinite" begin="0.5s"/></circle>
        <circle cx="16" cy="32" r="2"><animate attributeName="cy" values="32;16" dur="3s" repeatCount="indefinite" begin="1s"/></circle>
        <circle cx="48" cy="28" r="2.5"><animate attributeName="cy" values="28;12" dur="2.8s" repeatCount="indefinite" begin="1.5s"/></circle>
      </g><!-- letras mágicas -->
      <circle cx="32" cy="22" r="26" stroke-width="1" opacity="0.2"><animate attributeName="r" values="26;32" dur="3s" repeatCount="indefinite"/></circle>
      <circle cx="32" cy="22" r="26" stroke-width="1" opacity="0.15"><animate attributeName="r" values="28;34" dur="3s" repeatCount="indefinite" begin="1.5s"/></circle>
    </g></svg>`,
  },

  lab: {
    explorer: `<svg viewBox="0 0 64 64"><g fill="none" stroke="currentColor" stroke-width="2.5">
      <path d="M18 50h28"/><path d="M24 50v-18h16v18"/><path d="M32 32v-8"/><!-- mesa lab -->
      <circle cx="28" cy="40" r="4"/><circle cx="36" cy="40" r="4"/><path d="M28 44h8"/><!-- microscopio -->
    </g></svg>`,
    bronze: `<svg viewBox="0 0 64 64"><g fill="none" stroke="currentColor" stroke-width="2.5">
      <ellipse cx="32" cy="52" rx="20" ry="6" fill="currentColor" opacity="0.1"/>
      <path d="M16 48h32"/><path d="M22 48v-22h20v22"/><path d="M32 26v-6"/><!-- mesa grande -->
      <path d="M26 38h12"/><circle cx="28" cy="34" r="5"/><circle cx="36" cy="34" r="5"/><path d="M28 39h8"/><!-- micro mejorado -->
      <circle cx="25" cy="22" r="3"/><circle cx="39" cy="22" r="3"/><path d="M32 26c-3 0-5 2-5 5s2 5 5 5 5-2 5-5-2-5-5-5z"/><!-- ojos + naríz -->
      <path d="M18 34h6"/><path d="M40 34h6"/><path d="M18 40h6"/><path d="M40 40h6"/><!-- tubos -->
    </g></svg>`,
    silver: `<svg viewBox="0 0 64 64"><g fill="none" stroke="currentColor" stroke-width="2.5">
      <ellipse cx="32" cy="54" rx="22" ry="6" fill="currentColor" opacity="0.1"/>
      <path d="M14 46h36"/><path d="M20 46v-26h24v26"/><path d="M32 20v-6"/><!-- lab avanzado -->
      <path d="M24 36h16"/><circle cx="26" cy="32" r="6"/><circle cx="38" cy="32" r="6"/><path d="M26 38h8"/><!-- micro pro -->
      <circle cx="24" cy="18" r="4"/><circle cx="40" cy="18" r="4"/><!-- ojos -->
      <g fill="currentColor" opacity="0.4"><circle cx="28" cy="12" r="3"/><circle cx="36" cy="16" r="2.5"/><circle cx="22" cy="20" r="2"/><circle cx="42" cy="18" r="2"/></g><!-- átomos -->
      <circle cx="32" cy="26" r="20" stroke-width="1" opacity="0.2"><animate attributeName="r" values="20;26" dur="2.5s" repeatCount="indefinite"/></circle>
    </g></svg>`,
    gold: `<svg viewBox="0 0 64 64"><g fill="none" stroke="currentColor" stroke-width="2.5">
      <ellipse cx="32" cy="56" rx="24" ry="6" fill="currentColor" opacity="0.1"/>
      <path d="M12 44h40"/><path d="M18 44v-30h28v30"/><path d="M32 14v-6"/><!-- mega lab -->
      <path d="M22 34h20"/><circle cx="25" cy="30" r="7"/><circle cx="39" cy="30" r="7"/><path d="M25 37h10"/><!-- micro cuántico -->
      <circle cx="23" cy="16" r="5"><animate attributeName="opacity" values="1;0.5;1" dur="1.5s" repeatCount="indefinite"/></circle>
      <circle cx="41" cy="16" r="5"><animate attributeName="opacity" values="1;0.5;1" dur="1.5s" repeatCount="indefinite" begin="0.75s"/></circle>
      <g fill="currentColor" opacity="0.5">
        <circle cx="24" cy="10" r="4"><animate attributeName="cy" values="10;26" dur="1.5s" repeatCount="indefinite"/></circle>
        <circle cx="40" cy="14" r="3.5"><animate attributeName="cy" values="14;28" dur="1.8s" repeatCount="indefinite" begin="0.3s"/></circle>
        <circle cx="20" cy="20" r="3"><animate attributeName="cy" values="20;34" dur="2s" repeatCount="indefinite" begin="0.6s"/></circle>
        <circle cx="44" cy="16" r="3"><animate attributeName="cy" values="16;30" dur="1.7s" repeatCount="indefinite" begin="0.9s"/></circle>
      </g><!-- átomos orbitando -->
      <path d="M16 32h8"/><path d="M40 32h8"/><path d="M16 38h8"/><path d="M40 38h8"/><!-- reactores -->
      <circle cx="32" cy="20" r="28" stroke-width="1" opacity="0.2"><animate attributeName="r" values="28;34" dur="2s" repeatCount="indefinite"/></circle>
      <circle cx="32" cy="20" r="28" stroke-width="1" opacity="0.15"><animate attributeName="r" values="30;36" dur="2s" repeatCount="indefinite" begin="1s"/></circle>
    </g></svg>`,
  },
};

/** Insignias de esfuerzo (transversales) */
export const EFFORT_SVGS: EffortSvgSet = {
  retry: `<svg viewBox="0 0 64 64"><g fill="none" stroke="currentColor" stroke-width="2.5">
    <path d="M32 10a22 22 0 1 1 0 44 22 22 0 0 1 0-44z"/><!-- círculo -->
    <path d="M32 18v10"/><path d="M38 22l-6-6 6-6"/><!-- flecha vuelta -->
  </g></svg>`,
  explorer: `<svg viewBox="0 0 64 64"><g fill="none" stroke="currentColor" stroke-width="2.5">
    <path d="M32 10a22 22 0 1 1 0 44 22 22 0 0 1 0-44z"/>
    <path d="M32 18v16"/><path d="M24 26h16"/><path d="M26 22h12"/><path d="M30 18h4"/><!-- brújula -->
  </g></svg>`,
  days: `<svg viewBox="0 0 64 64"><g fill="none" stroke="currentColor" stroke-width="2.5">
    <rect x="14" y="20" width="36" height="30" rx="4"/><!-- calendario -->
    <path d="M14 30h36"/><path d="M22 30v24"/><path d="M32 30v24"/><path d="M42 30v24"/><!-- semanas -->
    <circle cx="32" cy="24" r="3"/><circle cx="28" cy="24" r="1"/><circle cx="36" cy="24" r="1"/><!-- header -->
  </g></svg>`,
  calm: `<svg viewBox="0 0 64 64"><g fill="none" stroke="currentColor" stroke-width="2.5">
    <path d="M32 10a22 22 0 1 1 0 44 22 22 0 0 1 0-44z"/>
    <path d="M20 32q6-8 12-8t12 8"/><!-- luna creciente -->
    <path d="M32 40v4"/><circle cx="32" cy="48" r="2"/><!-- estrella -->
    <g opacity="0.4"><circle cx="18" cy="18" r="1.5"/><circle cx="46" cy="16" r="1"/><circle cx="20" cy="44" r="1"/><circle cx="44" cy="46" r="1.5"/></g><!-- estrellas -->
  </g></svg>`,
  firstTry: `<svg viewBox="0 0 64 64"><g fill="none" stroke="currentColor" stroke-width="2.5">
    <circle cx="32" cy="32" r="22"/><!-- objetivo -->
    <circle cx="32" cy="32" r="12" stroke-dasharray="4 4"/><!-- anillo medio -->
    <circle cx="32" cy="32" r="4" fill="currentColor"/><!-- centro = acierto -->
    <path d="M32 6v4M32 54v4M6 32h4M54 32h4" stroke-width="3"/><!-- mira -->
  </g></svg>`,
  help: `<svg viewBox="0 0 64 64"><g fill="none" stroke="currentColor" stroke-width="2.5">
    <circle cx="32" cy="32" r="22"/><!-- badge redondo -->
    <path d="M32 18a14 14 0 0 1 0 28"/><!-- oreja izq -->
    <path d="M32 18a14 14 0 0 0 0 28"/><!-- oreja der -->
    <circle cx="26" cy="28" r="2"/><circle cx="38" cy="28" r="2"/><!-- ojos -->
    <path d="M28 38h8"/><!-- sonrisa -->
    <path d="M32 12v-4"/><circle cx="32" cy="6" r="1.5"/><!-- antena -->
  </g></svg>`,
  perfect: `<svg viewBox="0 0 64 64"><g fill="none" stroke="currentColor" stroke-width="2.5">
    <circle cx="32" cy="32" r="22"/><!-- escudo -->
    <path d="M32 14a18 18 0 0 1 0 36 18 18 0 0 1 0-36z" fill="currentColor" opacity="0.2"/><!-- gema -->
    <polygon points="32,16 44,32 32,48 20,32" fill="currentColor" opacity="0.4"/><!-- diamante -->
    <circle cx="32" cy="32" r="6" stroke-width="2"/><!-- ojo dragón -->
    <circle cx="32" cy="32" r="2" fill="currentColor"/><!-- pupila -->
  </g></svg>`,
  welcome: `<svg viewBox="0 0 64 64"><g fill="none" stroke="currentColor" stroke-width="2.5">
    <path d="M32 10a22 22 0 1 1 0 44 22 22 0 0 1 0-44z"/><!-- caja regalo -->
    <path d="M10 32h44"/><path d="M32 10v44"/><!-- lazo -->
    <path d="M26 26v12"/><path d="M30 26v12"/><path d="M34 26v12"/><path d="M38 26v12"/><!-- detalle caja -->
    <g fill="currentColor" opacity="0.3"><circle cx="20" cy="20" r="3"/><circle cx="44" cy="20" r="2"/><circle cx="20" cy="44" r="2"/><circle cx="44" cy="44" r="3"/></g><!-- brillos -->
  </g></svg>`,
};

/** Mapa categoría → key de SVGs */
export const CATEGORY_TO_MASCOT_KEY: Record<string, string> = {
  math: 'space',
  japanese: 'sakura',
  chinese: 'dragon',
  spanish: 'stories',
  english: 'lab',
};

/** Obtiene el SVG para una insignia de juego */
export function getGameBadgeSvg(category: string, tier: 'seed' | 'bronze' | 'silver' | 'gold'): string {
  const mascotKey = CATEGORY_TO_MASCOT_KEY[category] || 'space';
  return MASCOT_SVGS[mascotKey]?.[tier] ?? MASCOT_SVGS['space'][tier];
}

/** Obtiene el SVG para una insignia de categoría (mundo) */
export function getCategoryBadgeSvg(category: string, kind: 'explorer' | 'bronze' | 'silver' | 'gold'): string {
  const mascotKey = CATEGORY_TO_MASCOT_KEY[category] || 'space';
  return CATEGORY_SVGS[mascotKey]?.[kind] ?? CATEGORY_SVGS['space'][kind];
}

/** Obtiene el SVG para una insignia de esfuerzo */
export function getEffortBadgeSvg(kind: keyof EffortSvgSet): string {
  return EFFORT_SVGS[kind];
}