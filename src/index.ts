// liquid-glass: drop-in liquid glass for any website.
//   <script type="module" src="https://cdn.jsdelivr.net/gh/MuhammadaliMS/liquid-glass@1/dist/liquid-glass.js"></script>
//   <liquid-glass backdrop="aurora">
//     <nav glass>…</nav>
//     <button glass>Get started</button>
//   </liquid-glass>
import { LiquidGlassElement } from './element';

export { LiquidGlassElement } from './element';
export type { Pane } from './core/renderer';

if (typeof customElements !== 'undefined' && !customElements.get('liquid-glass')) {
  customElements.define('liquid-glass', LiquidGlassElement);
}
