export function decodeCloudflareEmail(encodedString) {
  const r = parseInt(encodedString.substr(0, 2), 16);

  let email = '';

  for (let i = 2; i < encodedString.length; i += 2) {
    const charCode =
      parseInt(encodedString.substr(i, 2), 16) ^ r;

    email += String.fromCharCode(charCode);
  }

  return email;
}