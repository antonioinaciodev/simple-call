// Captura do áudio de um programa no Windows (WASAPI "process loopback", Windows 10 2004+).
// O app desktop roda este programa e lê o som pela saída padrão.
//
//   simplecall-audio capture include <pid>   áudio só desse processo (e dos filhos dele): o jogo
//   simplecall-audio capture exclude <pid>   áudio do PC inteiro menos esse processo: tudo menos a call
//   simplecall-audio pid <hwnd>              pid do dono de uma janela (pra achar o processo do jogo)
//
// Saída: PCM float32 intercalado, 2 canais, 48 kHz. Para sozinho quando a entrada padrão fecha
// (o app fechou ou parou a transmissão), então nunca fica processo perdido.
//
// Compilar (Prompt do Visual Studio): cl /nologo /O2 /EHsc /std:c++17 win-audio.cpp ole32.lib mmdevapi.lib user32.lib

#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <audioclient.h>
#include <audioclientactivationparams.h>
#include <mmdeviceapi.h>

#include <fcntl.h>
#include <io.h>

#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <vector>

namespace {

constexpr UINT32 kRate = 48000;
constexpr UINT16 kChannels = 2;
volatile bool g_running = true;

int fail(const char* what, HRESULT hr) {
  std::fprintf(stderr, "erro: %s (0x%08lx)\n", what, static_cast<unsigned long>(hr));
  return 1;
}

// Recebe o fim da ativação assíncrona do cliente de áudio. Precisa ser "agile" (IAgileObject).
class ActivateHandler : public IActivateAudioInterfaceCompletionHandler, public IAgileObject {
 public:
  ActivateHandler() : done_(CreateEventW(nullptr, TRUE, FALSE, nullptr)) {}
  ~ActivateHandler() { CloseHandle(done_); }

  HANDLE done() const { return done_; }
  HRESULT result() const { return hr_; }
  IAudioClient* client() const { return client_; }

  STDMETHODIMP QueryInterface(REFIID riid, void** out) override {
    if (riid == __uuidof(IUnknown) || riid == __uuidof(IActivateAudioInterfaceCompletionHandler)) {
      *out = static_cast<IActivateAudioInterfaceCompletionHandler*>(this);
    } else if (riid == __uuidof(IAgileObject)) {
      *out = static_cast<IAgileObject*>(this);
    } else {
      *out = nullptr;
      return E_NOINTERFACE;
    }
    AddRef();
    return S_OK;
  }
  STDMETHODIMP_(ULONG) AddRef() override { return InterlockedIncrement(&refs_); }
  STDMETHODIMP_(ULONG) Release() override {
    ULONG n = InterlockedDecrement(&refs_);
    if (n == 0) delete this;
    return n;
  }

  STDMETHODIMP ActivateCompleted(IActivateAudioInterfaceAsyncOperation* op) override {
    IUnknown* unk = nullptr;
    HRESULT activateHr = E_FAIL;
    HRESULT hr = op->GetActivateResult(&activateHr, &unk);
    if (SUCCEEDED(hr)) hr = activateHr;
    if (SUCCEEDED(hr) && unk) hr = unk->QueryInterface(IID_PPV_ARGS(&client_));
    if (unk) unk->Release();
    hr_ = hr;
    SetEvent(done_);
    return S_OK;
  }

 private:
  LONG refs_ = 1;
  HANDLE done_;
  HRESULT hr_ = E_PENDING;
  IAudioClient* client_ = nullptr;
};

// O app fecha a entrada padrão pra mandar parar.
DWORD WINAPI WatchStdin(LPVOID) {
  char buf[64];
  while (std::fread(buf, 1, sizeof buf, stdin) > 0) {
  }
  g_running = false;
  return 0;
}

int Capture(bool include, DWORD pid) {
  HRESULT hr = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
  if (FAILED(hr)) return fail("CoInitializeEx", hr);

  AUDIOCLIENT_ACTIVATION_PARAMS params = {};
  params.ActivationType = AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK;
  params.ProcessLoopbackParams.TargetProcessId = pid;
  params.ProcessLoopbackParams.ProcessLoopbackMode =
      include ? PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE : PROCESS_LOOPBACK_MODE_EXCLUDE_TARGET_PROCESS_TREE;

  PROPVARIANT prop = {};
  prop.vt = VT_BLOB;
  prop.blob.cbSize = sizeof(params);
  prop.blob.pBlobData = reinterpret_cast<BYTE*>(&params);

  auto* handler = new ActivateHandler();
  IActivateAudioInterfaceAsyncOperation* op = nullptr;
  hr = ActivateAudioInterfaceAsync(VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK, __uuidof(IAudioClient), &prop, handler, &op);
  if (FAILED(hr)) return fail("ActivateAudioInterfaceAsync (precisa do Windows 10 2004 ou mais novo)", hr);
  WaitForSingleObject(handler->done(), INFINITE);
  if (op) op->Release();
  if (FAILED(handler->result())) return fail("ativar captura do processo", handler->result());
  IAudioClient* client = handler->client();

  WAVEFORMATEX format = {};
  format.wFormatTag = WAVE_FORMAT_IEEE_FLOAT;
  format.nChannels = kChannels;
  format.nSamplesPerSec = kRate;
  format.wBitsPerSample = 32;
  format.nBlockAlign = format.nChannels * format.wBitsPerSample / 8;
  format.nAvgBytesPerSec = format.nSamplesPerSec * format.nBlockAlign;

  // 20 ms de buffer: pouca latência sem estourar quando o PC engasga.
  hr = client->Initialize(AUDCLNT_SHAREMODE_SHARED,
                          AUDCLNT_STREAMFLAGS_LOOPBACK | AUDCLNT_STREAMFLAGS_EVENTCALLBACK |
                              AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM | AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY,
                          200000, 0, &format, nullptr);
  if (FAILED(hr)) return fail("IAudioClient::Initialize", hr);

  HANDLE ready = CreateEventW(nullptr, FALSE, FALSE, nullptr);
  hr = client->SetEventHandle(ready);
  if (FAILED(hr)) return fail("SetEventHandle", hr);

  IAudioCaptureClient* capture = nullptr;
  hr = client->GetService(IID_PPV_ARGS(&capture));
  if (FAILED(hr)) return fail("GetService", hr);

  _setmode(_fileno(stdout), _O_BINARY);
  CreateThread(nullptr, 0, WatchStdin, nullptr, 0, nullptr);

  hr = client->Start();
  if (FAILED(hr)) return fail("Start", hr);
  std::fprintf(stderr, "ok\n");
  std::fflush(stderr);

  std::vector<float> silence;
  while (g_running) {
    // Com o programa em silêncio não chega pacote nenhum; o app completa com silêncio.
    if (WaitForSingleObject(ready, 200) != WAIT_OBJECT_0) continue;
    UINT32 packet = 0;
    while (SUCCEEDED(capture->GetNextPacketSize(&packet)) && packet > 0) {
      BYTE* data = nullptr;
      UINT32 frames = 0;
      DWORD flags = 0;
      hr = capture->GetBuffer(&data, &frames, &flags, nullptr, nullptr);
      if (FAILED(hr)) break;
      const size_t samples = static_cast<size_t>(frames) * kChannels;
      const float* out = reinterpret_cast<const float*>(data);
      if (flags & AUDCLNT_BUFFERFLAGS_SILENT) {
        silence.assign(samples, 0.0f);
        out = silence.data();
      }
      const bool ok = std::fwrite(out, sizeof(float), samples, stdout) == samples;
      capture->ReleaseBuffer(frames);
      if (!ok) g_running = false;  // o app fechou a leitura
    }
    std::fflush(stdout);
  }

  client->Stop();
  capture->Release();
  client->Release();
  CloseHandle(ready);
  CoUninitialize();
  return 0;
}

}  // namespace

int main(int argc, char** argv) {
  if (argc == 4 && std::strcmp(argv[1], "capture") == 0) {
    const bool include = std::strcmp(argv[2], "include") == 0;
    if (!include && std::strcmp(argv[2], "exclude") != 0) return 2;
    return Capture(include, static_cast<DWORD>(std::strtoul(argv[3], nullptr, 10)));
  }
  if (argc == 3 && std::strcmp(argv[1], "pid") == 0) {
    HWND hwnd = reinterpret_cast<HWND>(static_cast<uintptr_t>(std::strtoull(argv[2], nullptr, 10)));
    DWORD pid = 0;
    if (!GetWindowThreadProcessId(hwnd, &pid) || pid == 0) return 1;
    std::printf("%lu\n", static_cast<unsigned long>(pid));
    return 0;
  }
  std::fprintf(stderr, "uso: simplecall-audio capture include|exclude <pid> | pid <hwnd>\n");
  return 2;
}
