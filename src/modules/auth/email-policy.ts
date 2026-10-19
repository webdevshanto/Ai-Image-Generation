import disposableDomains from 'disposable-email-domains' with { type: 'json' };
import wildcardDisposableDomains from 'disposable-email-domains/wildcard.json' with { type: 'json' };

const allowedEmailDomains = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'hotmail.co.uk',
  'hotmail.fr',
  'live.com',
  'live.co.uk',
  'msn.com',
  'yahoo.com',
  'yahoo.co.uk',
  'yahoo.co.in',
  'yahoo.ca',
  'yahoo.com.au',
  'yahoo.co.jp',
  'yahoo.de',
  'yahoo.fr',
  'yahoo.es',
  'yahoo.it',
  'yahoo.com.br',
  'yahoo.com.mx',
  'yahoo.com.sg',
  'yahoo.co.id',
  'yahoo.com.tw',
  'ymail.com',
  'rocketmail.com',
]);

const disposableDomainSet = new Set(disposableDomains);
const wildcardDisposableDomainSet = new Set(wildcardDisposableDomains);

function getDomain(email: string) {
  return email.slice(email.lastIndexOf('@') + 1).toLowerCase();
}

export function isDisposableEmail(email: string) {
  const domain = getDomain(email);
  if (
    disposableDomainSet.has(domain) ||
    wildcardDisposableDomainSet.has(domain)
  ) {
    return true;
  }

  const labels = domain.split('.');
  for (let index = 1; index < labels.length; index += 1) {
    if (wildcardDisposableDomainSet.has(labels.slice(index).join('.'))) {
      return true;
    }
  }

  return false;
}

export function isAllowedEmailProvider(email: string) {
  return allowedEmailDomains.has(getDomain(email)) && !isDisposableEmail(email);
}
