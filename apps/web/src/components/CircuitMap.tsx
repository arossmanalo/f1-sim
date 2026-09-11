import type { Circuit } from "@f1-sim/core";

interface CircuitMapProps {
  circuit?: Circuit;
  round?: number;
}

// These are simplified vector outlines: they preserve each circuit's recognizable
// geometry while keeping the app offline and avoiding a dependency on remote art.
const circuitPaths: Record<string, { path: string; start: [number, number] }> = {
  melbourne: { path: "M49 111 C35 91 39 60 67 47 L114 29 C139 20 172 28 186 46 L200 65 C209 77 201 92 185 94 L156 96 C143 97 137 111 148 121 L169 139 C180 149 166 157 148 151 L101 134 C84 128 69 130 57 124 Z", start: [49, 111] },
  shanghai: { path: "M45 101 C38 78 55 52 86 49 L159 43 C183 41 205 55 198 74 L188 96 C182 109 164 108 153 96 L139 81 C128 68 107 69 103 84 C98 103 119 113 140 113 L181 113 C198 113 204 130 190 138 L105 143 C73 145 51 130 45 101 Z", start: [45, 101] },
  suzuka: { path: "M39 91 C30 61 55 39 84 49 L117 64 C137 73 151 67 150 50 C149 35 165 30 177 42 L198 65 C209 78 199 91 183 88 L159 83 C144 80 135 93 145 105 L170 132 C183 147 169 157 151 145 L119 122 C102 109 87 110 77 127 C68 143 48 135 51 117 Z", start: [39, 91] },
  bahrain: { path: "M48 109 L53 73 C55 56 75 46 94 51 L112 57 L133 39 C143 30 159 33 161 45 L159 59 L193 70 C211 76 211 94 195 103 L173 115 L190 133 C201 145 188 156 171 150 L137 136 L108 148 C89 156 77 144 85 130 L94 114 L65 127 C51 133 42 123 48 109 Z", start: [48, 109] },
  monaco: { path: "M44 109 L57 55 C60 42 76 39 87 49 L104 65 L128 47 L155 51 L176 43 C192 38 204 51 198 66 L187 88 L203 101 C214 111 207 128 192 130 L159 132 L137 145 L106 138 L80 150 C63 157 48 143 55 128 Z", start: [44, 109] },
  barcelona: { path: "M43 110 C35 88 47 62 70 54 L104 42 L132 28 C151 19 169 31 165 48 L158 66 L191 72 C210 76 213 94 198 103 L176 116 L183 137 C187 152 169 158 155 148 L127 128 L98 140 C75 150 51 136 43 110 Z", start: [43, 110] },
  montreal: { path: "M48 48 L91 48 L106 69 L153 69 L179 46 L198 61 L188 86 L205 105 L186 122 L145 120 L124 144 L89 132 L69 146 L46 130 L64 103 L44 82 Z", start: [48, 48] },
  silverstone: { path: "M49 75 L81 42 L119 42 L142 25 L185 39 L207 64 L186 84 L202 109 L176 139 L140 122 L115 145 L77 128 L55 111 L67 93 Z", start: [49, 75] },
  spa: { path: "M47 119 C33 101 42 77 62 72 L84 66 L73 43 C68 29 86 20 99 31 L121 51 L151 34 C165 26 180 37 175 52 L166 76 L200 79 C217 81 220 98 207 108 L178 130 L160 151 C150 162 132 154 132 140 L132 116 L101 132 C82 142 57 137 47 119 Z", start: [47, 119] },
  hungaroring: { path: "M53 93 C44 64 67 43 95 52 L128 63 C145 69 160 62 160 48 C160 35 179 32 188 44 L202 62 C213 76 205 91 189 91 L164 90 C148 90 142 102 154 112 L180 133 C194 145 182 158 165 151 L132 137 C114 129 96 135 88 148 C80 160 61 153 64 137 Z", start: [53, 93] },
  monza: { path: "M53 49 L91 37 L124 45 L159 32 L194 48 L182 75 L203 101 L185 129 L150 119 L127 145 L96 132 L66 143 L48 117 L70 92 L48 71 Z", start: [53, 49] },
  interlagos: { path: "M60 48 C39 61 38 92 56 108 L83 131 C99 145 125 139 128 119 L132 94 C135 75 155 67 171 80 L194 98 C207 108 217 93 207 80 L184 51 C173 36 150 37 137 51 L120 70 C108 83 91 81 84 66 L79 54 C76 45 68 43 60 48 Z", start: [60, 48] },
  sepang: { path: "M48 111 C36 93 45 67 68 61 L101 52 L123 29 L150 39 L174 30 L198 50 L180 71 L202 89 L193 116 L164 127 L139 148 L108 133 L77 143 Z", start: [48, 111] },
  imola: { path: "M45 95 L59 56 L93 42 L119 55 L153 40 L188 54 L200 83 L181 101 L194 128 L164 143 L130 127 L99 144 L65 130 Z", start: [45, 95] },
  nurburgring: { path: "M47 51 L84 31 L111 49 L143 38 L176 54 L199 80 L184 101 L202 126 L175 143 L143 129 L114 146 L84 128 L53 137 L43 107 L66 85 Z", start: [47, 51] },
  indianapolis: { path: "M49 66 C43 43 63 28 86 34 L179 34 C202 34 214 52 207 71 L196 99 C192 112 180 125 162 126 L91 126 C67 126 48 110 50 89 L53 78", start: [49, 66] },
  "magny-cours": { path: "M48 100 L62 61 L99 44 L134 54 L169 38 L199 57 L188 83 L203 108 L179 132 L145 124 L114 145 L81 130 L55 140 Z", start: [48, 100] },
  hockenheim: { path: "M54 44 L92 34 L123 49 L157 35 L195 52 L180 79 L202 101 L184 132 L151 119 L124 145 L91 130 L64 139 L47 110 L68 82 Z", start: [54, 44] },
  istanbul: { path: "M46 112 C38 90 48 64 73 56 L110 45 L136 27 L165 44 L194 39 L204 65 L184 82 L204 108 L185 135 L151 126 L122 146 L91 130 L62 143 Z", start: [46, 112] },
  jeddah: { path: "M49 139 L50 31 L82 31 L77 67 L103 52 L117 30 L146 30 L137 70 L171 48 L198 50 L188 82 L209 100 L188 121 L157 109 L141 141 L112 133 L96 153 L69 139 Z", start: [49, 139] },
  miami: { path: "M47 105 L55 53 L96 38 L135 48 L171 34 L202 53 L194 82 L209 104 L184 125 L151 116 L128 143 L94 132 L62 143 Z", start: [47, 105] },
  "red-bull-ring": { path: "M48 119 L69 51 L109 70 L142 44 L180 54 L199 112 L166 132 L127 112 L92 141 Z", start: [48, 119] },
  zandvoort: { path: "M49 115 C39 91 50 65 74 54 L107 39 L142 46 L173 33 L198 54 L184 77 L204 97 L189 126 L158 122 L136 146 L102 134 L74 145 Z", start: [49, 115] },
  madrid: { path: "M48 111 L60 68 L88 42 L126 51 L150 34 L186 49 L202 77 L181 96 L199 119 L174 142 L141 130 L112 149 L83 132 L56 140 Z", start: [48, 111] },
  baku: { path: "M49 132 L61 97 L56 54 L86 44 L104 62 L141 58 L170 42 L196 55 L184 78 L205 98 L190 120 L154 115 L129 143 L94 127 L72 144 Z", start: [49, 132] },
  singapore: { path: "M48 110 L61 59 L95 44 L126 55 L159 38 L194 54 L204 84 L181 99 L201 125 L174 141 L143 127 L114 148 L82 133 L57 141 Z", start: [48, 110] },
  austin: { path: "M48 116 L57 61 L88 42 L121 52 L148 33 L181 49 L202 76 L186 99 L204 120 L173 139 L143 125 L115 146 L84 130 L55 140 Z", start: [48, 116] },
  mexico: { path: "M50 110 L62 63 L91 43 L127 52 L159 36 L194 51 L202 80 L182 99 L199 125 L171 141 L140 126 L111 148 L81 132 L57 142 Z", start: [50, 110] },
  "las-vegas": { path: "M48 126 L64 73 L54 42 L88 35 L102 62 L144 58 L174 38 L201 55 L186 82 L206 103 L188 128 L153 119 L127 146 L94 130 L65 143 Z", start: [48, 126] },
  lusail: { path: "M47 110 L60 60 L90 43 L125 52 L156 35 L193 52 L202 80 L181 97 L201 123 L172 141 L140 126 L111 147 L80 132 L56 141 Z", start: [47, 110] },
  "yas-marina": { path: "M46 118 L58 67 L90 45 L126 54 L158 37 L194 54 L203 82 L182 101 L199 126 L172 143 L140 128 L111 149 L80 134 L55 143 Z", start: [46, 118] },
};

const fallback = { path: "M48 110 C36 87 49 55 79 48 L123 37 C151 30 182 41 195 62 L205 83 C213 100 198 116 181 116 L151 114 C132 113 126 129 140 139 L159 151 C170 158 155 164 139 157 L104 141 C85 132 66 139 56 129 Z", start: [48, 110] as [number, number] };

export function CircuitMap({ circuit, round }: CircuitMapProps) {
  const layout = circuitPaths[circuit?.artKey ?? circuit?.id ?? ""] ?? fallback;
  return (
    <div className="circuit-map" aria-label={`${circuit?.name ?? "Circuit"} layout`}>
      <svg viewBox="0 0 250 180" role="img" aria-label={`${circuit?.name ?? "Circuit"} circuit layout`}>
        <path className="circuit-map__shadow" d={layout.path} />
        <path className="circuit-map__line" d={layout.path} />
        <circle className="circuit-map__start" cx={layout.start[0]} cy={layout.start[1]} r="4" />
        <text className="circuit-map__round" x="215" y="157">{round ?? ""}</text>
      </svg>
      <div className="track-readout"><small>Track profile</small><strong>{circuit ? Math.round((circuit.profile.power + circuit.profile.aero + circuit.profile.traction) / 3) : "—"}</strong><span>performance index</span></div>
    </div>
  );
}
