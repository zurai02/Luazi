#ifndef __EMSCRIPTEN__
#include "vm.h"
#include <iostream>
#include <fstream>
#include <vector>

int main(int argc, char* argv[]) {
    if (argc < 2) {
        std::cout << "Luazi Native VM\n";
        std::cout << "Usage: luazi-native <bytecode-file>\n";
        return 0;
    }

    std::ifstream file(argv[1], std::ios::binary);
    if (!file) {
        std::cerr << "Error: Could not open file " << argv[1] << "\n";
        return 1;
    }

    std::vector<uint8_t> buffer((std::istreambuf_iterator<char>(file)),
                                 std::istreambuf_iterator<char>());

    luazi::VM vm;
    vm.load(buffer.data(), buffer.size());
    luazi::Value res = vm.execute();
    return res.is_number() ? static_cast<int>(res.as_number()) : 0;
}
#endif
