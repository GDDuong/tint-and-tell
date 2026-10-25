import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanChat } from '../server/chat.ts';
import { CHAT_MAX } from '../src/game.ts';

test('chat is plain text with markup and control characters stripped', () => {
  assert.equal(
    cleanChat('<img src=x onerror=alert(1)>hello'),
    'img src=x onerror=alert(1) hello',
  );
  assert.equal(cleanChat('  a\n\tb  '), 'a b');
  assert.equal(cleanChat('\u202eevil'), 'evil');
  assert.equal(cleanChat('x'.repeat(CHAT_MAX + 20)).length, CHAT_MAX);
  assert.equal(cleanChat(null), '');
  assert.equal(cleanChat('   '), '');
});
