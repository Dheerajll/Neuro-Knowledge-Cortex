# Neuron

Private knowledge graph for notes on your own disk. Notes are neurons; related notes link
into clusters; clusters group into a knowledge base. All storage is local files.

## Run

    npm install
    npm run dev        # development
    npm start          # build + run

## Package for your own machine

    npm run dist       # -> dist/mac-arm64/Neuron.app

Drag Neuron.app to /Applications. Unsigned builds need a right-click > Open the first time.

## Where data lives

~/Library/Application Support/Neuron/neuron/

- notes/        one JSON file per note
- attachments/  images
- vectors.json  embeddings
- ../settings.json

Back up that folder by copying it.

## Keyboard

⌘K ask/search · ⌘N new note · ⌘Enter save · Esc back