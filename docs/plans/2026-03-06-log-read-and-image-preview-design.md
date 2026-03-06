# Read State And Image Preview Design

## Goals

- Read state must point to a specific message instead of implying the newest message is read.
- Log mode must stay dense and must not gain extra row height.
- Image hover preview must stop affecting message list layout.
- Extension and page client should share the same interaction model.

## Approach

- Keep the top bar as a weak summary only.
- Show one inline Read marker only on the last outbound message that is covered by peer lastReadMessageId.
- If lastReadMessageId is missing, keep only the weak summary and do not guess the anchor message.
- Replace inline image tooltip preview with a fixed overlay rendered at app root.
- Message items only emit hover enter move leave events for the overlay.

## Verification

- Add smoke tests for read marker selection and summary state.
- Run extension type check plus repo lint and tests.
