'use client';

import { Box, Button, Heading, Text, useColorModeValue } from '@chakra-ui/react';
import { useRouter } from 'next/navigation';

export default function SplitScreenLogin() {
  const router = useRouter();
  const textColor = useColorModeValue('navy.700', 'white');

  return (
    <Box minH="100vh" display="flex" alignItems="center" justifyContent="center" flexDir="column" gap="4">
      <Heading size="xl" color={textColor}>Sign In</Heading>
      <Text color="gray.500">Split-screen login placeholder.</Text>
      <Button variant="brand" onClick={() => router.push('/auth/sign-in')}>
        Go to Sign In
      </Button>
    </Box>
  );
}
