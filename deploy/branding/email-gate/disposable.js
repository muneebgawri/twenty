'use strict';

// Throwaway-inbox domains.
//
// Copied verbatim from Herald Engine's verification service
// (apps/api/src/verification/verification.service.ts, DISPOSABLE_DOMAINS) so the CRM and
// the sender agree on what a disposable address is. Two lists that drift are worse than
// one list that is short: a contact the CRM accepted and the sender then silently dropped
// looks like the campaign lost it.
//
// If this needs to grow, grow it in Herald and re-copy, so the direction of truth stays
// one-way. Herald is where the verdict lives; this file exists only because a save cannot
// wait on a network call to ask.

const DISPOSABLE_DOMAINS = new Set([
    // Mailinator family
    'mailinator.com', 'notmailinator.com', 'binkmail.com', 'bobmail.info',
    'chammy.info', 'devnullmail.com', 'safetymail.info',
    // Guerrilla Mail family
    'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org',
    'guerrillamail.de', 'guerrillamail.biz', 'guerrillamail.info',
    'grr.la', 'sharklasers.com', 'guerrillamailblock.com', 'spam4.me',
    // YOPMail family
    'yopmail.com', 'yopmail.fr', 'cool.fr.nf', 'jetable.fr.nf',
    'nospam.ze.tc', 'nomail.xl.cx',
    // 10 Minute Mail
    '10minutemail.com', '10minutemail.net', '10minutemail.org',
    '10minutemail.co.uk', '10minutemail.de', '10minutemail.ru', '10minutemail.us',
    // Trash / temp mail
    'trashmail.at', 'trashmail.io', 'trashmail.me', 'trashmail.net',
    'trashmail.com', 'trashdevil.com', 'trashdevil.de',
    'dispostable.com', 'discard.email', 'discardmail.com', 'discardmail.de',
    'filzmail.com', 'mailnesia.com', 'mailnull.com',
    'temp-mail.org', 'tempmail.com', 'tempr.email', 'tempinbox.com',
    'temporaryemail.net', 'mytrashmail.com',
    'throwam.com', 'throwam.net',
    // Drop / single-use
    'maildrop.cc', 'mailsac.com', 'mailexpire.com', 'mailscrap.com',
    'mailsiphon.com', 'spamex.com',
    'spamgourmet.com', 'spamgourmet.net', 'spamgourmet.org',
    'spamtrap.ro', 'spaml.de', 'spaml.com', 'spamspot.com', 'spamfree.eu',
    // Jetable
    'jetable.net', 'jetable.org', 'jetable.com', 'jetable.pp.ua',
    // Other well-known disposable providers
    'fakeinbox.com', 'fakeinbox.net', 'getonemail.com',
    'harakirimail.com', 'hidemail.de',
    'incognitomail.com', 'incognitomail.net', 'incognitomail.org',
    'kasmail.com', 'letthemeatspam.com',
    'mail2trash.com', 'mailbidon.com', 'mailbolt.com', 'mailmoat.com',
    'mailzilla.com', 'meltmail.com', 'mintemail.com',
    'nospam.ze.tc', 'obobbo.com', 'oneoffemail.com', 'pookmail.com',
    'quickinbox.com', 'rcpt.at', 'shieldedmail.com', 'sneakemail.com',
    'sofimail.com', 'spamcero.com', 'suremail.info',
    'tempea.email', 'tittbit.in',
    'webemail.me', 'wegwerfmail.de', 'wegwerfmail.net', 'wegwerfmail.org',
    'xagloo.com', 'xemaps.com', 'yapped.net',
    'zehnminutenmail.de', 'zippymail.info',
]);

/** Case-folded on the way in; the caller already lowercases, this is belt and braces. */
function isDisposable(domain) {
  return DISPOSABLE_DOMAINS.has(String(domain || '').toLowerCase());
}

module.exports = { isDisposable, DISPOSABLE_DOMAINS };
