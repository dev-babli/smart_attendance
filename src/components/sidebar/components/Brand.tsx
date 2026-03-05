// Chakra imports
import { Flex, Text, useColorModeValue } from '@chakra-ui/react';

// Custom components
import { HSeparator } from 'components/separator/Separator';

export function SidebarBrand() {
	let logoColor = useColorModeValue('navy.700', 'white');

	return (
		<Flex alignItems='center' flexDirection='column'>
			<Text fontSize='xl' fontWeight='700' my='32px' color={logoColor}>
				Dashboard
			</Text>
			<HSeparator mb='20px' />
		</Flex>
	);
}

export default SidebarBrand;
