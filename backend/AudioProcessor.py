from audio_separator.separator import Separator
import os
import tempfile
import logging

class AudioProcessor:
    output_names = {
        "vocal_instrumental": {
            "Vocals": "base_vocals",
            "Instrumental": "base_instrumental"
        },
        "lead_backing": {
            "Vocals": "lead",
            "Instrumental": "backing"
        },
        "htdemucs_6s": {
            "Vocals": "vocals_output",
            "Drums": "drums_output",
            "Bass": "bass_output",
            "Other": "other_output",
            "Guitar": "guitar_output",
            "Piano": "piano_output",
        }
    }

    def __init__(self, input_audio, output_format="flac"):
        self.input_audio = input_audio
        self.output_format = output_format
        # Cria uma pasta única para esse "projeto"
        self.output_folder = tempfile.mkdtemp(prefix="audio_project_")
        
        # O Separator é inicializado uma vez, mas carregamos modelos sob demanda
        self.separator = Separator(
            output_dir=self.output_folder, 
            output_format=self.output_format
        )

        # Dicionário de Estado: Guarda o caminho dos arquivos que JÁ foram gerados
        self.files = {
            "source_vocals": None,       # Vocal limpo (pós Roformer 1296)
            "source_instrumental": None, # Instrumental (pós Roformer 1296)
            "lead": None,
            "backing": None,
            "stems": {                   # Stems do Demucs
                "drums": None,
                "bass": None, 
                "guitar": None, 
                "piano": None,
                "other": None
            }
        }

    def _get_path(self, filename):
        """Reconstrói o caminho completo baseado no nome e formato"""
        full_name = f"{filename}.{self.output_format}"
        return os.path.join(self.output_folder, full_name)

    # =================================================================
    # MÓDULO 1: Separação Base (Vocal vs Instrumental)
    # =================================================================
    def extract_vocals_instrumental(self):
        """
        Executa o BS-Roformer-1296.
        Retorna os caminhos dos arquivos gerados.
        """
        print(">>> Iniciando Módulo: Extração de Vocais (BS-Roformer)...")
        self.separator.load_model(model_filename="model_bs_roformer_ep_368_sdr_12.9628.ckpt")
        
        # Executa separação
        self.separator.separate(self.input_audio, custom_output_names=self.output_names["vocal_instrumental"])

        # Atualiza o estado
        self.files["source_vocals"] = self._get_path("base_vocals")
        self.files["source_instrumental"] = self._get_path("base_instrumental")
        
        return {
            "vocals": self.files["source_vocals"],
            "instrumental": self.files["source_instrumental"]
        }

    # =================================================================
    # MÓDULO 2: Separação Fina (Lead vs Backing)
    # =================================================================
    def extract_lead_backing(self):
        """
        Executa o Mel-Band-Roformer.
        DEPENDÊNCIA: Precisa que 'base_vocals' já exista. Se não existir, roda o Módulo 1 automaticamente.
        """
        # Verifica dependência
        if not self.files["source_vocals"]:
            print("(!) Aviso: Vocais não encontrados. Executando extração de vocais primeiro...")
            self.extract_vocals_instrumental()

        print(">>> Iniciando Módulo: Lead vs Backing...")
        self.separator.load_model(model_filename="mel_band_roformer_karaoke_aufr33_viperx_sdr_10.1956.ckpt")

        self.separator.separate(self.files["source_vocals"], custom_output_names=self.output_names["lead_backing"])

        self.files["lead"] = self._get_path("final_lead")
        self.files["backing"] = self._get_path("final_backing")

        return {
            "lead": self.files["lead"],
            "backing": self.files["backing"]
        }

    # =================================================================
    # MÓDULO 3: Separação de Instrumentos (Banda)
    # =================================================================
    def extract_instruments(self):
        """
        Executa o Demucs 6s.
        Independente dos outros módulos.
        """
        print(">>> Iniciando Módulo: Instrumentos (Demucs)...")
        self.separator.load_model(model_filename="htdemucs_6s.yaml")
        
        self.separator.separate(self.input_audio, custom_output_names=self.output_names["htdemucs_6s"])
        
        vocals_output_path = self._get_path(self.output_names["htdemucs_6s"]["Vocals"])
        if os.path.exists(vocals_output_path):
            os.remove(vocals_output_path)

        self.files["stems"]["drums"] = self._get_path("drums_output")
        self.files["stems"]["bass"] = self._get_path("bass_output")
        self.files["stems"]["guitar"] = self._get_path("guitar_output")
        self.files["stems"]["piano"] = self._get_path("piano_output")
        self.files["stems"]["other"] = self._get_path("other_output")


        return self.files["stems"]