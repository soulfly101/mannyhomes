// Stand-in for Leaflet in jest (jsdom can't draw maps). Records what the page asked for.
export const calls = {
  setView: [] as [number, number][],
  markers: [] as { latlng: [number, number]; title?: string; click?: () => void }[],
  tiles: [] as string[],
};

export function reset() {
  calls.setView.length = 0;
  calls.markers.length = 0;
  calls.tiles.length = 0;
}

const map = () => {
  const m = {
    setView(latlng: [number, number]) {
      calls.setView.push(latlng);
      return m;
    },
    remove() {},
  };
  return m;
};

const leaflet = {
  map,
  tileLayer: (url: string) => ({
    addTo() {
      calls.tiles.push(url);
      return this;
    },
  }),
  divIcon: (o: unknown) => o,
  marker: (latlng: [number, number], opts: { title?: string }) => {
    const entry: { latlng: [number, number]; title?: string; click?: () => void } = { latlng, title: opts?.title };
    calls.markers.push(entry);
    const marker = {
      on(_: string, fn: () => void) {
        entry.click = fn;
        return marker;
      },
    };
    return marker;
  },
  layerGroup: () => ({
    addTo() {
      return { remove() {} };
    },
  }),
};

export default leaflet;
