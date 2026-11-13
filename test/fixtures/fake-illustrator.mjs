/**
 * A tiny stand-in for Illustrator's ExtendScript globals, enough to run the
 * JSX runtime offline. Only what tests need; grows with the tool set.
 */

function enumOf(name, members) {
  const out = {};
  for (const m of members) out[m] = Object.freeze({ toString: () => `${name}.${m}` });
  return Object.freeze(out);
}

export function createFakeGlobals(state = {}) {
  const UserInteractionLevel = enumOf('UserInteractionLevel', ['DONTDISPLAYALERTS', 'DISPLAYALERTS']);
  const CoordinateSystem = enumOf('CoordinateSystem', ['DOCUMENTCOORDINATESYSTEM', 'ARTBOARDCOORDINATESYSTEM']);
  const DocumentColorSpace = enumOf('DocumentColorSpace', ['RGB', 'CMYK']);

  const documents = (state.documents || []).map((d) => {
    const artboards = d.artboards.map((a) => ({ name: a.name, artboardRect: a.rect }));
    artboards.getActiveArtboardIndex = () => d.activeArtboard || 0;
    return {
      name: d.name,
      saved: d.saved ?? true,
      documentColorSpace: d.cmyk ? DocumentColorSpace.CMYK : DocumentColorSpace.RGB,
      get fullName() {
        if (!d.path) throw new Error('document has not been saved');
        return { fsName: d.path };
      },
      artboards,
    };
  });

  const app = {
    version: state.version || '30.1.0',
    buildNumber: '136R',
    scriptingVersion: '30.0',
    locale: 'en_US',
    userInteractionLevel: UserInteractionLevel.DISPLAYALERTS,
    coordinateSystem: CoordinateSystem.ARTBOARDCOORDINATESYSTEM,
    documents,
    get activeDocument() {
      return documents[0];
    },
  };

  return { app, UserInteractionLevel, CoordinateSystem, DocumentColorSpace };
}
