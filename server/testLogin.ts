export const testLoginEnabled = () =>
  process.env.NODE_ENV === 'development' && process.env.NOUR_TEST_LOGIN === 'true';
export const isTestUsername = (username: string) => username.startsWith('__test_');
